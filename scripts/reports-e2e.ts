/* Reports runtime e2e (T-104) — proves GET /v1/reports/{sales,items,tax} over HTTP against a
 * running API + seeded DB, the same way billing-e2e.ts proves the billing endpoints. Env: API_URL,
 * seed creds. Since other e2e runs may have already settled bills for today, every assertion is a
 * BEFORE/AFTER DELTA around one known bill this script creates — never an absolute count — so the
 * script is safe to re-run in a shared/dirty dev DB.
 * Covers:
 *   - unauthenticated request -> 401 (permissions('reports.read') is structural, same rationale as
 *     scripts/hardening-check.ts's deny-by-default note: no route exists without a policy to probe)
 *   - validation: missing outletId / from>to -> 400
 *   - sales summary: gross/tax/net/collected deltas match the bill exactly (1 bill, 1 payment)
 *   - item-wise: qty + net-amount delta for the sold item matches the bill line exactly
 *   - tax summary: CGST/SGST delta for the item's rate bracket matches the bill exactly
 *   - a voided (unpaid) bill increments the voids counter, not gross/net sales
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
async function newOrder(outletId: string, itemId: string, qty: number) {
  return (await api('POST', '/orders', { outletId, items: [{ itemId, qty }] })).json;
}
const rangeQ = (outletId: string, from: string, to: string) => `outletId=${outletId}&from=${from}&to=${to}`;

async function main() {
  const health = await fetch(`${BASE}/health`).then((r) => r.status).catch(() => 0);
  if (health !== 200) { console.log('==== REPORTS E2E: SKIPPED (no API) ===='); process.exit(1); }
  TOKEN = (await api('POST', '/auth/login', creds)).json?.accessToken ?? '';
  check(!!TOKEN, 'login -> token');
  const outletId = (await api('GET', '/outlets')).json?.[0]?.id;
  const eff = await api('GET', `/menu/outlets/${outletId}/effective`);
  const items = (eff.json?.categories ?? []).flatMap((c: any) => c.items ?? []);
  const noReq = (i: any) => (i.modifierGroups ?? []).every((g: any) => (g.minSelect ?? 0) === 0);
  const item = items.filter((i: any) => i.isAvailable !== false && noReq(i))[0];
  check(!!outletId && !!item?.id, 'discovered outlet + item');
  if (!outletId || !item?.id) { console.log('==== REPORTS E2E: SKIPPED ===='); process.exit(1); }
  const today = new Date().toISOString().slice(0, 10);

  // --- [0] auth + validation boundary ---
  console.log('\n[0] auth + validation:');
  const noAuth = await api('GET', `/reports/sales?${rangeQ(outletId, today, today)}`, undefined, false);
  check(noAuth.status === 401, `no token -> 401 (got ${noAuth.status})`);
  const noOutlet = await api('GET', `/reports/sales?from=${today}&to=${today}`);
  check(noOutlet.status === 400, `missing outletId -> 400 (got ${noOutlet.status})`);
  const badRange = await api('GET', `/reports/sales?${rangeQ(outletId, today, '2020-01-01')}`);
  check(badRange.status === 400, `from > to -> 400 (got ${badRange.status})`);

  // --- [1] before snapshot ---
  const before = {
    sales: (await api('GET', `/reports/sales?${rangeQ(outletId, today, today)}`)).json,
    items: (await api('GET', `/reports/items?${rangeQ(outletId, today, today)}`)).json,
    tax: (await api('GET', `/reports/tax?${rangeQ(outletId, today, today)}`)).json,
  };
  check(!!before.sales && !!before.items && !!before.tax, 'baseline sales/items/tax reports fetched');

  // --- [2] one known settled bill: qty 2 of `item`, full cash payment ---
  console.log('\n[2] settle one bill, then diff the reports against it:');
  const qty = 2;
  const o = await newOrder(outletId, item.id, qty);
  const bill = (await api('POST', '/bills', { orderId: o.id })).json;
  check(!!bill?.id, `bill created (subtotal=${bill?.subtotal})`);
  await api('POST', `/bills/${bill.id}/finalize`, {});
  const pay = await api('POST', `/bills/${bill.id}/payments`, { mode: 'CASH', amount: bill.total, idempotencyKey: `rpt-${bill.id}`.slice(0, 70) });
  check(pay.status === 200 || pay.status === 201, `bill paid in full (${pay.status})`);
  const settled = (await api('GET', `/bills/${bill.id}`)).json;
  check(settled?.status === 'SETTLED', `bill -> SETTLED (got ${settled?.status})`);

  // --- [3] sales summary delta ---
  const after = {
    sales: (await api('GET', `/reports/sales?${rangeQ(outletId, today, today)}`)).json,
    items: (await api('GET', `/reports/items?${rangeQ(outletId, today, today)}`)).json,
    tax: (await api('GET', `/reports/tax?${rangeQ(outletId, today, today)}`)).json,
  };
  const d = (after: any, before: any, key: string) => (after?.[key] ?? 0) - (before?.[key] ?? 0);
  console.log('\n[3] sales summary delta matches the bill exactly:');
  check(d(after.sales, before.sales, 'bills') === 1, `bills +1 (${before.sales.bills} -> ${after.sales.bills})`);
  check(d(after.sales, before.sales, 'grossSales') === bill.subtotal, `grossSales +${bill.subtotal} (got +${d(after.sales, before.sales, 'grossSales')})`);
  check(d(after.sales, before.sales, 'taxableSales') === bill.taxable, `taxableSales +${bill.taxable}`);
  check(d(after.sales, before.sales, 'taxTotal') === bill.taxTotal, `taxTotal +${bill.taxTotal}`);
  check(d(after.sales, before.sales, 'cgst') === bill.cgst && d(after.sales, before.sales, 'sgst') === bill.sgst, `cgst/sgst deltas match (${bill.cgst}/${bill.sgst})`);
  check(d(after.sales, before.sales, 'netSales') === bill.total, `netSales +${bill.total}`);
  check(d(after.sales, before.sales, 'collected') === bill.total, `collected +${bill.total}`);
  const cashBefore = before.sales.byMode?.CASH?.collected ?? 0;
  const cashAfter = after.sales.byMode?.CASH?.collected ?? 0;
  check(cashAfter - cashBefore === bill.total, `byMode.CASH.collected +${bill.total} (${cashBefore} -> ${cashAfter})`);

  // --- [4] item-wise delta ---
  console.log('\n[4] item-wise sales delta matches the bill line exactly:');
  const findLine = (r: any) => (r?.items ?? []).find((x: any) => x.name === item.name);
  const lineBefore = findLine(before.items) ?? { qty: 0, netAmount: 0 };
  const lineAfter = findLine(after.items);
  check(!!lineAfter, `item '${item.name}' present in item-wise report`);
  check((lineAfter?.qty ?? 0) - lineBefore.qty === qty, `qty +${qty} (${lineBefore.qty} -> ${lineAfter?.qty})`);
  const rawNet = bill.taxable + bill.taxTotal; // pre-round-off, since item report doesn't carry tip/round-off
  check((lineAfter?.netAmount ?? 0) - lineBefore.netAmount === rawNet, `netAmount +${rawNet} (taxable+tax, pre-round-off)`);

  // --- [5] tax bracket delta ---
  console.log('\n[5] GST bracket delta matches the bill exactly:');
  const findBracket = (r: any) => (r?.brackets ?? []).find((b: any) => b.taxRateBps === item.taxRateBps);
  const brBefore = findBracket(before.tax) ?? { cgst: 0, sgst: 0 };
  const brAfter = findBracket(after.tax);
  check(!!brAfter, `bracket ${item.taxRateBps}bps present in tax report`);
  check((brAfter?.cgst ?? 0) - brBefore.cgst === bill.cgst && (brAfter?.sgst ?? 0) - brBefore.sgst === bill.sgst, `cgst/sgst deltas match (${bill.cgst}/${bill.sgst})`);

  // --- [6] a voided (unpaid) bill counts as a void, not a sale ---
  console.log('\n[6] voided bill -> voids +1, sales unchanged:');
  const ov = await newOrder(outletId, item.id, 1);
  const bv = (await api('POST', '/bills', { orderId: ov.id })).json;
  await api('POST', `/bills/${bv.id}/finalize`, {});
  const voidRes = await api('POST', `/bills/${bv.id}/void`, { reason: 'reports e2e void' });
  check(voidRes.status === 200 || voidRes.status === 201, `void unpaid bill -> ok (${voidRes.status})`);
  const afterVoid = (await api('GET', `/reports/sales?${rangeQ(outletId, today, today)}`)).json;
  check(d(afterVoid, after.sales, 'voids') === 1, `voids +1 (${after.sales.voids} -> ${afterVoid.voids})`);
  check(d(afterVoid, after.sales, 'netSales') === 0, `netSales unchanged by a void (+${d(afterVoid, after.sales, 'netSales')})`);

  console.log(`\n==== REPORTS E2E VERDICT: ${failures === 0 ? 'PASS' : `FAIL (${failures})`} ====`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('REPORTS E2E RUNNER ERROR:', e); process.exit(1); });
