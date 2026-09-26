/* Self-serve onboarding e2e (T-106) — proves POST /v1/auth/signup over HTTP against a running API.
 * Env: API_URL. Creates its own throwaway tenant (random slug) so it's safe to re-run anywhere.
 * Covers:
 *   - happy path: tenant + owner + outlet provisioned, auto-login token works, principal has every
 *     owner permission, GET /v1/outlets returns exactly the one outlet just created
 *   - tenant isolation: the new tenant cannot see the demo tenant's data (RLS proof, not just a unit test)
 *   - duplicate slug -> 409 ; weak password / bad slug format -> 400
 *   - login with the just-created credentials works (row actually persisted, not just returned)
 *   - signup rate limit (5/min) -> 429 on the 6th call
 */
const BASE = process.env.API_URL ?? 'http://localhost:4000';
const V = `${BASE}/v1`;
let failures = 0;
const check = (c: boolean, l: string) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
async function api(method: string, path: string, body?: unknown, token?: string) {
  const r = await fetch(`${V}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null; try { json = await r.json(); } catch { /**/ }
  return { status: r.status, json };
}

async function main() {
  const health = await fetch(`${BASE}/health`).then((r) => r.status).catch(() => 0);
  if (health !== 200) { console.log('==== SIGNUP E2E: SKIPPED (no API) ===='); process.exit(1); }

  const stamp = Date.now().toString(36);
  const slug = `e2e-${stamp}`;
  const email = `owner-${stamp}@example.test`;
  const signupBody = { tenantName: `E2E Test Kitchen ${stamp}`, tenantSlug: slug, ownerName: 'E2E Owner', email, password: 'Password123!', outletName: 'Flagship' };

  // --- [1] happy path ---
  console.log('\n[1] signup -> tenant + owner + outlet provisioned, auto-login:');
  const s1 = await api('POST', '/auth/signup', signupBody);
  check(s1.status === 201, `signup -> 201 (got ${s1.status})`);
  check(!!s1.json?.accessToken && !!s1.json?.user, 'response has accessToken + user principal');
  const token = s1.json?.accessToken as string;
  const principal = s1.json?.user;
  check(principal?.roles?.includes('owner'), `principal has owner role (got ${JSON.stringify(principal?.roles)})`);
  check((principal?.permissions ?? []).includes('tenant.manage') && (principal?.permissions ?? []).includes('reports.read'), 'owner principal has the full permission set (spot-check tenant.manage + reports.read)');

  const me = await api('GET', '/auth/me', undefined, token);
  check(me.status === 200 && me.json?.tenantId === principal?.tenantId, `GET /auth/me confirms the session (${me.status})`);

  const outlets = await api('GET', '/outlets', undefined, token);
  check(Array.isArray(outlets.json) && outlets.json.length === 1, `GET /outlets returns exactly 1 outlet (got ${outlets.json?.length})`);
  check(outlets.json?.[0]?.name === 'Flagship', `outlet name = 'Flagship' as requested (got ${outlets.json?.[0]?.name})`);

  // --- [2] tenant isolation: the new tenant sees none of the demo tenant's menu ---
  console.log('\n[2] tenant isolation (new tenant starts empty, not seeing the demo tenant):');
  const menu = await api('GET', '/menu/categories?includeInactive=true', undefined, token);
  check(Array.isArray(menu.json) && menu.json.length === 0, `new tenant has 0 menu categories (got ${menu.json?.length}) — none of demo's leaked in`);

  // --- [3] the persisted credentials actually work via the normal login path ---
  console.log('\n[3] login with the just-created credentials:');
  const login = await api('POST', '/auth/login', { tenantSlug: slug, email, password: 'Password123!' });
  check(login.status === 200 && !!login.json?.accessToken, `login -> 200 with a fresh token (got ${login.status})`);

  // --- [4] duplicate slug rejected ---
  console.log('\n[4] duplicate tenant slug rejected:');
  const dup = await api('POST', '/auth/signup', { ...signupBody, email: `owner2-${stamp}@example.test` });
  check(dup.status === 409, `duplicate slug -> 409 (got ${dup.status})`);

  // --- [5] validation ---
  console.log('\n[5] validation boundary:');
  const weakPw = await api('POST', '/auth/signup', { ...signupBody, tenantSlug: `${slug}-2`, email: `owner3-${stamp}@example.test`, password: 'short' });
  check(weakPw.status === 400, `password < 8 chars -> 400 (got ${weakPw.status})`);
  const badSlug = await api('POST', '/auth/signup', { ...signupBody, tenantSlug: 'Not A Valid Slug!', email: `owner4-${stamp}@example.test` });
  check(badSlug.status === 400, `invalid slug format -> 400 (got ${badSlug.status})`);

  // --- [6] signup rate limit (5/min) ---
  console.log('\n[6] signup rate limit (5/min) -> 429 on the 6th call:');
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await api('POST', '/auth/signup', { ...signupBody, tenantSlug: `${slug}-rl-${i}`, email: `rl${i}-${stamp}@example.test` });
    statuses.push(r.status);
  }
  console.log('  statuses(1..6):', statuses.join(','));
  check(statuses[5] === 429, `6th signup in the window -> 429 (got ${statuses[5]})`);

  console.log(`\n==== SIGNUP E2E VERDICT: ${failures === 0 ? 'PASS' : `FAIL (${failures})`} ====`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('SIGNUP E2E RUNNER ERROR:', e); process.exit(1); });
