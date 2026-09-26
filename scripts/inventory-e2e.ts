/* Basic inventory e2e (T-107) — proves stock CRUD, the manual ledger, recipes, and recipe-based
 * auto-deduction on KOT send, over HTTP against a running API + seeded DB. Env: API_URL, seed creds.
 * Every check targets an item this script creates itself (unique per run via a timestamp suffix in
 * the name), so it's safe to re-run against a shared/dirty dev DB.
 * Covers:
 *   - no token -> 401 (permissions('inventory.read'/'write') is structural, same as every other domain)
 *   - create/update an item; duplicate name -> 409; qtyMilli=0 adjust -> 400
 *   - manual adjust: RECEIVE movement, balance updates exactly, ledger reflects it
 *   - low-stock filter: below threshold -> included, above -> excluded
 *   - recipe: set a recipe line, GET reflects it
 *   - auto-deduction: sending a KOT for qty N deducts exactly recipe.qtyMilli * N, records a DEDUCT
 *     movement tagged with the kotId — proven via a before/after balance diff, not an absolute value
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
  if (health !== 200) { console.log('==== INVENTORY E2E: SKIPPED (no API) ===='); process.exit(1); }
  TOKEN = (await api('POST', '/auth/login', creds)).json?.accessToken ?? '';
  check(!!TOKEN, 'login -> token');
  const outletId = (await api('GET', '/outlets')).json?.[0]?.id;
  const eff = await api('GET', `/menu/outlets/${outletId}/effective`);
  const items = (eff.json?.categories ?? []).flatMap((c: any) => c.items ?? []);
  const noReq = (i: any) => (i.modifierGroups ?? []).every((g: any) => (g.minSelect ?? 0) === 0);
  const menuItem = items.filter((i: any) => i.isAvailable !== false && noReq(i))[0];
  check(!!outletId && !!menuItem?.id, 'discovered outlet + menu item');
  if (!outletId || !menuItem?.id) { console.log('==== INVENTORY E2E: SKIPPED ===='); process.exit(1); }

  // --- [0] auth boundary ---
  console.log('\n[0] auth boundary:');
  const noAuth = await api('GET', '/inventory/items', undefined, false);
  check(noAuth.status === 401, `no token -> 401 (got ${noAuth.status})`);

  // --- [1] create + duplicate + update ---
  console.log('\n[1] create item, duplicate rejected, update:');
  const stamp = Date.now().toString(36);
  const name = `E2E Flour ${stamp}`;
  const created = await api('POST', '/inventory/items', { name, unit: 'g', lowStockMilli: 500_000 });
  check(created.status === 201, `create -> 201 (got ${created.status})`);
  const itemId = created.json?.id as string;
  check(created.json?.stockMilli === 0, `opening stock defaults to 0 (got ${created.json?.stockMilli})`);
  const dup = await api('POST', '/inventory/items', { name, unit: 'g' });
  check(dup.status === 409, `duplicate name -> 409 (got ${dup.status})`);
  const updated = await api('PATCH', `/inventory/items/${itemId}`, { lowStockMilli: 1_000_000 });
  check(updated.status === 200 && updated.json?.lowStockMilli === 1_000_000, `update lowStockMilli -> 1,000,000 (got ${updated.json?.lowStockMilli})`);

  // --- [2] manual adjust: receive stock, ledger, balance ---
  console.log('\n[2] manual adjust (receive 5,000,000 milli = 5kg):');
  const badAdjust = await api('POST', `/inventory/items/${itemId}/adjust`, { qtyMilli: 0, reason: 'noop' });
  check(badAdjust.status === 400, `qtyMilli=0 -> 400 (got ${badAdjust.status})`);
  const receive = await api('POST', `/inventory/items/${itemId}/adjust`, { qtyMilli: 5_000_000, reason: 'opening delivery' });
  check(receive.status === 201, `receive -> 201 (got ${receive.status})`);
  check(receive.json?.type === 'RECEIVE' && receive.json?.balanceMilli === 5_000_000, `movement type=RECEIVE balance=5,000,000 (got ${receive.json?.type}/${receive.json?.balanceMilli})`);
  const afterReceive = await api('GET', `/inventory/items/${itemId}`);
  check(afterReceive.json?.stockMilli === 5_000_000, `item.stockMilli == 5,000,000 (got ${afterReceive.json?.stockMilli})`);
  const movements = await api('GET', `/inventory/items/${itemId}/movements`);
  check(Array.isArray(movements.json) && movements.json.length === 1 && movements.json[0].qtyMilli === 5_000_000, `ledger has exactly the one RECEIVE movement`);

  // --- [3] low-stock filter ---
  console.log('\n[3] low-stock filter:');
  const aboveThreshold = await api('GET', '/inventory/items?lowStockOnly=true');
  check(!(aboveThreshold.json ?? []).some((i: any) => i.id === itemId), 'item above its threshold is excluded from lowStockOnly');
  const downTo = await api('POST', `/inventory/items/${itemId}/adjust`, { qtyMilli: -4_600_000, reason: 'e2e: drop below threshold' });
  check(downTo.status === 201 && downTo.json?.type === 'ADJUST', `downward adjust -> type=ADJUST (got ${downTo.json?.type})`);
  const belowThreshold = await api('GET', '/inventory/items?lowStockOnly=true');
  check((belowThreshold.json ?? []).some((i: any) => i.id === itemId), 'item at/below its threshold IS included in lowStockOnly');

  // --- [4] recipe: set + read back ---
  console.log('\n[4] set recipe (1 unit of the menu item consumes 80,000 milli = 80g):');
  const perUnit = 80_000;
  const setRecipe = await api('PUT', `/inventory/recipes/${menuItem.id}`, { lines: [{ inventoryItemId: itemId, qtyMilli: perUnit }] });
  check(setRecipe.status === 200 || setRecipe.status === 201, `set recipe -> ok (${setRecipe.status})`);
  const recipe = await api('GET', `/inventory/recipes?menuItemId=${menuItem.id}`);
  check(Array.isArray(recipe.json) && recipe.json.length === 1 && recipe.json[0].qtyMilli === perUnit && recipe.json[0].inventoryItemId === itemId, 'GET recipe reflects the line just set');

  // --- [5] auto-deduction on KOT send ---
  console.log('\n[5] sending a KOT auto-deducts recipe.qtyMilli * qty:');
  const qty = 3;
  const before = (await api('GET', `/inventory/items/${itemId}`)).json?.stockMilli as number;
  const order = (await api('POST', '/orders', { outletId, items: [{ itemId: menuItem.id, qty }] })).json;
  const kot = await api('POST', `/orders/${order.id}/kots`, {});
  check(kot.status === 200 || kot.status === 201, `send KOT -> ok (${kot.status})`);
  const after = (await api('GET', `/inventory/items/${itemId}`)).json?.stockMilli as number;
  const expectedDeduct = perUnit * qty;
  check(before - after === expectedDeduct, `stock dropped by exactly ${expectedDeduct} milli (${before} -> ${after})`);
  const ledgerAfterKot = await api('GET', `/inventory/items/${itemId}/movements`);
  const deductRow = (ledgerAfterKot.json ?? []).find((m: any) => m.type === 'DEDUCT');
  check(!!deductRow && deductRow.qtyMilli === -expectedDeduct, `ledger has a DEDUCT movement of -${expectedDeduct} (got ${deductRow?.qtyMilli})`);
  check(!!deductRow?.kotId, 'DEDUCT movement is tagged with the KOT that triggered it');

  console.log(`\n==== INVENTORY E2E VERDICT: ${failures === 0 ? 'PASS' : `FAIL (${failures})`} ====`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('INVENTORY E2E RUNNER ERROR:', e); process.exit(1); });
