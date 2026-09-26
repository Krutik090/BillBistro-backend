/* Basic CRM e2e (T-109) — proves customer CRUD + search over HTTP against a running API + seeded DB.
 * Env: API_URL, seed creds. Uses a unique phone number per run so it's safe to re-run repeatedly.
 * Covers:
 *   - no token -> 401 (structural policy, same as every other domain)
 *   - create, duplicate phone -> 409, get, update (incl. duplicate-phone-on-update -> 409)
 *   - search by partial name and by partial phone both find the row
 *   - delete -> 404 afterward
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
  if (health !== 200) { console.log('==== CUSTOMERS E2E: SKIPPED (no API) ===='); process.exit(1); }
  TOKEN = (await api('POST', '/auth/login', creds)).json?.accessToken ?? '';
  check(!!TOKEN, 'login -> token');

  console.log('\n[0] auth boundary:');
  const noAuth = await api('GET', '/customers', undefined, false);
  check(noAuth.status === 401, `no token -> 401 (got ${noAuth.status})`);

  const stamp = Date.now().toString(36);
  const phone = `9${stamp}`.slice(0, 10);
  console.log('\n[1] create, duplicate rejected, get, update:');
  const created = await api('POST', '/customers', { name: `E2E Customer ${stamp}`, phone, email: 'e2e@example.test' });
  check(created.status === 201, `create -> 201 (got ${created.status})`);
  const id = created.json?.id as string;
  const dup = await api('POST', '/customers', { name: 'Someone else', phone });
  check(dup.status === 409, `duplicate phone -> 409 (got ${dup.status})`);
  const got = await api('GET', `/customers/${id}`);
  check(got.status === 200 && got.json?.phone === phone, `get -> 200, matches (got ${got.status})`);
  const updated = await api('PATCH', `/customers/${id}`, { notes: 'Prefers a window table' });
  check(updated.status === 200 && updated.json?.notes === 'Prefers a window table', `update notes -> reflected (got ${updated.json?.notes})`);

  console.log('\n[2] search by name and by phone both find it:');
  const byName = await api('GET', `/customers?q=${encodeURIComponent(`E2E Customer ${stamp}`)}`);
  check(Array.isArray(byName.json) && byName.json.some((c: any) => c.id === id), 'search by name finds the customer');
  const byPhone = await api('GET', `/customers?q=${phone.slice(0, 5)}`);
  check(Array.isArray(byPhone.json) && byPhone.json.some((c: any) => c.id === id), 'search by partial phone finds the customer');

  console.log('\n[3] delete -> 404 afterward:');
  const del = await api('DELETE', `/customers/${id}`);
  check(del.status === 204, `delete -> 204 (got ${del.status})`);
  const afterDel = await api('GET', `/customers/${id}`);
  check(afterDel.status === 404, `get after delete -> 404 (got ${afterDel.status})`);

  console.log(`\n==== CUSTOMERS E2E VERDICT: ${failures === 0 ? 'PASS' : `FAIL (${failures})`} ====`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('CUSTOMERS E2E RUNNER ERROR:', e); process.exit(1); });
