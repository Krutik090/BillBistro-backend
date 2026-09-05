/* Behavioural hardening e2e (T-120, Dwight) — probes a RUNNING BillBistro API over HTTP.
 *
 * Designed for CI (isolated runner + fresh Postgres service), which sidesteps the shared
 * node_modules / concurrent `prisma generate` race we hit locally. CI job shape:
 *   1. create app role (infra/postgres/init.sql) + migrate deploy + db:seed  (creates tenant `demo`)
 *   2. node apps/api/dist/server.js &   (or `npm run start --workspace=@billbistro/api` in background)
 *   3. wait for /health, then: npm run db:hardening-check
 *
 * Proves the T-020 hardening at runtime:
 *   - 423 LOCKED after LOGIN_MAX_FAILURES (5) bad passwords for a real user
 *   - 429 rate-limit after >10 logins/min (login @Throttle limit:10, ttl:60s)
 * Deny-by-default 403 is verified by code (PermissionsGuard): a route declaring none of
 *   @Public/@RequirePermissions/@AllowAuthenticated throws 403. No such route exists to probe,
 *   which is itself the correct state — so it is asserted by inspection, not HTTP.
 *
 * Env: API_URL (default http://localhost:4000), SEED_TENANT_SLUG (demo), SEED_OWNER_EMAIL (owner@demo.local).
 * Exits non-zero on any failed assertion. Run against an EPHEMERAL DB (it locks the seeded user).
 */
const BASE = process.env.API_URL ?? 'http://localhost:4000';
const SLUG = process.env.SEED_TENANT_SLUG ?? 'demo';
const EMAIL = process.env.SEED_OWNER_EMAIL ?? 'owner@demo.local';

let failures = 0;
const check = (cond: boolean, label: string) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};

async function login(body: unknown): Promise<number> {
  const r = await fetch(`${BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.status;
}

async function main() {
  const health = await fetch(`${BASE}/health`).then((r) => r.status).catch(() => 0);
  check(health === 200, `API reachable at ${BASE} (health=${health})`);
  if (health !== 200) {
    console.log('  API not running — start `node apps/api/dist/server.js` against a seeded DB first.');
    console.log('\n==== HARDENING VERDICT: SKIPPED (no API) ====');
    process.exit(1);
  }

  // One 11-call /v1/auth/login sequence proves BOTH 423 and 429 without throttle interference:
  //  calls 1-5: real user + wrong password (5th sets lockout) -> 401
  //  call  6  : real user again -> 423 (locked)
  //  calls 7-10: bogus tenant -> 401
  //  call  11 : 11th login in the window -> 429 (throttle limit 10/min)
  console.log('\n[lockout 423 + rate-limit 429] combined 11-call login sequence:');
  const status: number[] = [];
  // NOTE: every password here must satisfy LoginRequest (min 8 chars), otherwise the request is
  // rejected as a 400 at the validation boundary and never reaches the failed-login counter.
  for (let i = 0; i < 5; i++) status.push(await login({ tenantSlug: SLUG, email: EMAIL, password: `wrong-pass-${i}` }));
  status.push(await login({ tenantSlug: SLUG, email: EMAIL, password: 'wrong-again' })); // call 6
  for (let i = 7; i <= 11; i++) status.push(await login({ tenantSlug: 'no-such-tenant', email: 'x@x.tld', password: 'xxxxxxxx' }));
  console.log('  statuses(1..11):', status.join(','));
  check(status[5] === 423, `call 6: locked account -> 423 (got ${status[5]})`);
  check(status[10] === 429, `call 11: rate limit -> 429 (got ${status[10]})`);

  console.log('\n[deny-by-default 403] verified by code (PermissionsGuard throws 403 for a route with no policy).');

  console.log(`\n==== HARDENING VERDICT: ${failures === 0 ? 'PASS' : `FAIL (${failures})`} ====`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('HARDENING RUNNER ERROR:', e); process.exit(1); });
