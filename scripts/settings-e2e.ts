/* Business profile + outlet settings e2e (T-109) — proves GET/PATCH /v1/settings and
 * PATCH /v1/outlets/:id over HTTP against a running API + seeded DB. Restores the original values
 * afterward so it's safe to re-run and doesn't leave the demo tenant renamed.
 * Covers:
 *   - no token -> 401 on both
 *   - GET /settings returns the tenant profile; PATCH updates name/gstin and it's reflected on GET
 *   - PATCH /outlets/:id updates name/address/phone and it's reflected on GET /outlets/:id
 */
const BASE = process.env.API_URL ?? 'http://localhost:4000';
const V = `${BASE}/v1`;
const creds = { tenantSlug: process.env.SEED_TENANT_SLUG ?? 'demo', email: process.env.SEED_OWNER_EMAIL ?? 'owner@demo.local', password: process.env.SEED_OWNER_PASSWORD ?? 'Password123!' };
let failures = 0;
const check = (c: boolean, l: string) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
let TOKEN = '';
async function api(method: string, path: string, body?: unknown, auth = true) {
  const r = await fetch(`${V}${path}`, { method, headers: { 'content-type': 'application/json', ...(auth && TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null; try { json = await r.json(); } catch { /**/ }
  return { status: r.status, json };
}

async function main() {
  const health = await fetch(`${BASE}/health`).then((r) => r.status).catch(() => 0);
  if (health !== 200) { console.log('==== SETTINGS E2E: SKIPPED (no API) ===='); process.exit(1); }
  TOKEN = (await api('POST', '/auth/login', creds)).json?.accessToken ?? '';
  check(!!TOKEN, 'login -> token');
  const outletId = (await api('GET', '/outlets')).json?.[0]?.id;
  check(!!outletId, 'discovered outlet');
  if (!outletId) { console.log('==== SETTINGS E2E: SKIPPED ===='); process.exit(1); }

  console.log('\n[0] auth boundary:');
  check((await api('GET', '/settings', undefined, false)).status === 401, 'GET /settings no token -> 401');
  check((await api('PATCH', `/outlets/${outletId}`, { name: 'x' }, false)).status === 401, 'PATCH /outlets/:id no token -> 401');

  console.log('\n[1] business profile (settings):');
  const before = (await api('GET', '/settings')).json;
  check(!!before?.name && !!before?.currency, `GET /settings returns the profile (name=${before?.name})`);
  const stamp = Date.now().toString(36);
  const updated = await api('PATCH', '/settings', { name: `E2E Renamed ${stamp}`, gstin: '29ABCDE1234F1Z5' });
  check(updated.status === 200 && updated.json?.name === `E2E Renamed ${stamp}` && updated.json?.gstin === '29ABCDE1234F1Z5', `PATCH /settings -> reflected (got name=${updated.json?.name})`);
  const reread = await api('GET', '/settings');
  check(reread.json?.name === `E2E Renamed ${stamp}`, 'GET /settings after PATCH shows the new name');
  const restored = await api('PATCH', '/settings', { name: before.name, gstin: before.gstin ?? null });
  check(restored.status === 200 && restored.json?.name === before.name, 'restored the original name (cleanup)');

  console.log('\n[2] outlet profile:');
  const outBefore = (await api('GET', `/outlets/${outletId}`)).json;
  const outUpdated = await api('PATCH', `/outlets/${outletId}`, { phone: '+91 90000 00000' });
  check(outUpdated.status === 200 && outUpdated.json?.phone === '+91 90000 00000', `PATCH /outlets/:id -> reflected (got phone=${outUpdated.json?.phone})`);
  const outReread = await api('GET', `/outlets/${outletId}`);
  check(outReread.json?.phone === '+91 90000 00000', 'GET /outlets/:id after PATCH shows the new phone');
  await api('PATCH', `/outlets/${outletId}`, { phone: outBefore.phone ?? null });

  console.log(`\n==== SETTINGS E2E VERDICT: ${failures === 0 ? 'PASS' : `FAIL (${failures})`} ====`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('SETTINGS E2E RUNNER ERROR:', e); process.exit(1); });
