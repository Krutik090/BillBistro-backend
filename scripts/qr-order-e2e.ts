/* Public QR ordering e2e (T-108) — proves POST /v1/public/orders works with NO staff session, over
 * HTTP against a running API. Env: API_URL, seed creds (used only to verify the order afterward via
 * the authenticated path — never to create it).
 * Covers:
 *   - GET /v1/menu/outlets/:id/effective works with no token (menu.routes.ts policy is now PUBLIC)
 *   - POST /v1/public/orders with no Authorization header -> 201, server-priced exactly like the
 *     staff path (same money-math guarantee — money is never client-supplied)
 *   - the order is invisible nowhere: an authenticated staff GET /v1/orders/:id sees it, status OPEN
 *   - invalid outlet -> 404 ; empty items -> 400
 *   - the public rate limiter (separate from login/authenticated limiters) trips on its own
 */
const BASE = process.env.API_URL ?? 'http://localhost:4000';
const V = `${BASE}/v1`;
const creds = { tenantSlug: process.env.SEED_TENANT_SLUG ?? 'demo', email: process.env.SEED_OWNER_EMAIL ?? 'owner@demo.local', password: process.env.SEED_OWNER_PASSWORD ?? 'Password123!' };
let failures = 0;
const check = (c: boolean, l: string) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
async function api(method: string, path: string, body?: unknown, token?: string) {
  const r = await fetch(`${V}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null; try { json = await r.json(); } catch { /**/ }
  return { status: r.status, json };
}

async function main() {
  const health = await fetch(`${BASE}/health`).then((r) => r.status).catch(() => 0);
  if (health !== 200) { console.log('==== QR ORDER E2E: SKIPPED (no API) ===='); process.exit(1); }

  // Staff token used ONLY to discover the outlet/item and to verify the order afterward.
  const staffToken = (await api('POST', '/auth/login', creds)).json?.accessToken ?? '';
  check(!!staffToken, 'staff login (setup only) -> token');
  const outletId = (await api('GET', '/outlets', undefined, staffToken)).json?.[0]?.id;
  check(!!outletId, 'discovered outlet');
  if (!outletId) { console.log('==== QR ORDER E2E: SKIPPED ===='); process.exit(1); }

  // --- [0] public menu fetch, no token ---
  console.log('\n[0] public menu fetch (no token):');
  const menuNoAuth = await api('GET', `/menu/outlets/${outletId}/effective`);
  check(menuNoAuth.status === 200, `GET effective menu with no token -> 200 (got ${menuNoAuth.status})`);
  const items = (menuNoAuth.json?.categories ?? []).flatMap((c: any) => c.items ?? []);
  const noReq = (i: any) => (i.modifierGroups ?? []).every((g: any) => (g.minSelect ?? 0) === 0);
  const item = items.filter((i: any) => i.isAvailable !== false && noReq(i))[0];
  check(!!item?.id, 'discovered a priced item with no required modifiers');
  if (!item?.id) { console.log('==== QR ORDER E2E: SKIPPED ===='); process.exit(1); }

  // --- [1] create an order with NO Authorization header ---
  console.log('\n[1] public order create, no token, server-priced:');
  const qty = 2;
  const lt = item.effectivePrice ?? item.basePrice, bps = item.taxRateBps;
  const tax = Math.round((lt * qty * bps) / 10000);
  const create = await api('POST', '/public/orders', { outletId, items: [{ itemId: item.id, qty }] });
  check(create.status === 201, `create -> 201 (got ${create.status})`);
  check(create.json?.subtotal === lt * qty, `subtotal=${create.json?.subtotal} == ${lt * qty} (server-priced, not client-suppliable)`);
  check(create.json?.taxTotal === tax, `taxTotal=${create.json?.taxTotal} == ${tax}`);
  check(create.json?.status === 'OPEN', `status=${create.json?.status} == OPEN`);
  const orderId = create.json?.id as string;

  // --- [2] the order is real: staff sees it via the normal authenticated path ---
  console.log('\n[2] staff (authenticated) sees the order:');
  const staffView = await api('GET', `/orders/${orderId}`, undefined, staffToken);
  check(staffView.status === 200 && staffView.json?.id === orderId, `GET /orders/:id (authenticated) -> 200, same order (got ${staffView.status})`);

  // --- [3] validation ---
  console.log('\n[3] validation boundary:');
  const badOutlet = await api('POST', '/public/orders', { outletId: '00000000-0000-4000-8000-000000000000', items: [{ itemId: item.id, qty: 1 }] });
  check(badOutlet.status === 404, `unknown outlet -> 404 (got ${badOutlet.status})`);
  const noItems = await api('POST', '/public/orders', { outletId, items: [] });
  check(noItems.status === 400, `empty items -> 400 (got ${noItems.status})`);

  // --- [4] public order rate limit (separate limiter from login/staff writes) ---
  console.log('\n[4] public order rate limit trips on its own:');
  const statuses: number[] = [];
  for (let i = 0; i < 11; i++) statuses.push((await api('POST', '/public/orders', { outletId, items: [{ itemId: item.id, qty: 1 }] })).status);
  console.log('  statuses(1..11):', statuses.join(','));
  check(statuses.includes(429), `rate limit eventually trips (got ${statuses.join(',')})`);

  console.log(`\n==== QR ORDER E2E VERDICT: ${failures === 0 ? 'PASS' : `FAIL (${failures})`} ====`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('QR ORDER E2E RUNNER ERROR:', e); process.exit(1); });
