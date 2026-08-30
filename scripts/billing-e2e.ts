/* Billing runtime e2e (T-120, Dwight) — T-103 bill + payment correctness over HTTP.
 * Run against a running API + seeded DB (CI or clean-window local). Env: API_URL, seed creds.
 * Covers (top severity — money + idempotency):
 *   - bill totals per spec: taxable=subtotal-discount, per-line tax=round(taxable*bps/1e4),
 *     cgst=floor(tax/2)+sgst=rest, total=round((taxable+tax+tip)/100)*100, roundOff=total-raw
 *   - discount-before-tax (proportional; single-line here for a deterministic expected)
 *   - payment idempotency: same idempotencyKey replay -> same payment, paidTotal NOT doubled
 *   - overpay -> 422 ; pay-before-finalize -> 409 ; full pay -> bill SETTLED
 */
const BASE = process.env.API_URL ?? 'http://localhost:4000';
const V = `${BASE}/v1`;
const creds = { tenantSlug: process.env.SEED_TENANT_SLUG ?? 'demo', email: process.env.SEED_OWNER_EMAIL ?? 'owner@demo.local', password: process.env.SEED_OWNER_PASSWORD ?? 'Password123!' };
let failures = 0;
const check = (c: boolean, l: string) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const round = (n: number) => Math.round(n);
let TOKEN = '';
async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(`${V}${path}`, { method, headers: { 'content-type': 'application/json', ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null; try { json = await r.json(); } catch { /**/ }
  return { status: r.status, json };
}
async function newOrder(outletId: string, itemId: string, qty = 1) {
  return (await api('POST', '/orders', { outletId, items: [{ itemId, qty }] })).json;
}

async function main() {
  const health = await fetch(`${BASE}/health`).then((r) => r.status).catch(() => 0);
  if (health !== 200) { console.log('==== BILLING E2E: SKIPPED (no API) ===='); process.exit(1); }
  TOKEN = (await api('POST', '/auth/login', creds)).json?.accessToken ?? '';
  check(!!TOKEN, 'login -> token');
  const outletId = (await api('GET', '/outlets')).json?.[0]?.id;
  const eff = await api('GET', `/menu/outlets/${outletId}/effective`);
  const items = (eff.json?.categories ?? []).flatMap((c: any) => c.items ?? []);
  const noReq = (i: any) => (i.modifierGroups ?? []).every((g: any) => (g.minSelect ?? 0) === 0);
  const item = items.filter((i: any) => i.isAvailable !== false && noReq(i))[0];
  check(!!outletId && !!item?.id, `discovered outlet + item`);
  if (!outletId || !item?.id) { console.log('==== BILLING E2E: SKIPPED ===='); process.exit(1); }

  // --- [1] bill totals, no discount ---
  console.log('\n[1] bill totals (no discount) per spec:');
  const o1 = await newOrder(outletId, item.id, 1);
  const lt = o1.items[0].lineTotal as number, bps = o1.items[0].taxRateBps as number;
  const tax = round((lt * bps) / 10000);
  const raw = lt + tax, total = round(raw / 100) * 100;
  const b1 = await api('POST', '/bills', { orderId: o1.id });
  const bill = b1.json;
  check(b1.status === 201 || b1.status === 200, `create bill (${b1.status})`);
  check(bill?.subtotal === lt && bill?.taxable === lt && bill?.taxTotal === tax, `subtotal=${bill?.subtotal}/${lt} taxable=${bill?.taxable}/${lt} tax=${bill?.taxTotal}/${tax}`);
  check((bill?.cgst ?? -1) === Math.floor(tax / 2) && (bill?.sgst ?? -1) === tax - Math.floor(tax / 2) && bill?.cgst + bill?.sgst === tax, `CGST=${bill?.cgst}=floor(${tax}/2), SGST=${bill?.sgst}, sum=tax`);
  check(bill?.total === total && bill?.roundOff === total - raw, `total=${bill?.total}/${total} roundOff=${bill?.roundOff}/${total - raw}`);

  // --- [2] discount-before-tax ---
  console.log('\n[2] discount-before-tax:');
  const o2 = await newOrder(outletId, item.id, 1);
  const disc = 500;
  const taxable2 = lt - disc, tax2 = round((taxable2 * bps) / 10000), raw2 = taxable2 + tax2, total2 = round(raw2 / 100) * 100;
  const b2 = (await api('POST', '/bills', { orderId: o2.id, discount: disc })).json;
  check(b2?.taxable === taxable2 && b2?.taxTotal === tax2 && b2?.total === total2, `discount ${disc}: taxable=${b2?.taxable}/${taxable2} tax=${b2?.taxTotal}/${tax2} total=${b2?.total}/${total2}`);

  // --- [3] payment idempotency + settle ---
  console.log('\n[3] payment idempotency (no double-post) + settle:');
  const fin = await api('POST', `/bills/${bill.id}/finalize`, {});
  check(fin.status === 200 || fin.status === 201, `finalize bill (${fin.status})`);
  const key = `pay-${bill.id}`.slice(0, 70);
  const p1 = await api('POST', `/bills/${bill.id}/payments`, { mode: 'CASH', amount: total, idempotencyKey: key });
  const p2 = await api('POST', `/bills/${bill.id}/payments`, { mode: 'CASH', amount: total, idempotencyKey: key });
  check(!!p1.json?.id && (p1.json?.id === p2.json?.id || p2.status === 200), `same idempotencyKey replay -> same payment (no double-post)`);
  const after = await api('GET', `/bills/${bill.id}`);
  const paid = after.json?.paidTotal ?? after.json?.paid ?? after.json?.totals?.paid;
  check(paid === total, `paidTotal=${paid} == total ${total} (NOT doubled)`);
  check(after.json?.status === 'SETTLED', `bill status -> SETTLED (got ${after.json?.status})`);

  // --- [4] overpay 422 ---
  console.log('\n[4] overpay rejected:');
  const o4 = await newOrder(outletId, item.id, 1);
  const b4 = (await api('POST', '/bills', { orderId: o4.id })).json;
  await api('POST', `/bills/${b4.id}/finalize`, {});
  const over = await api('POST', `/bills/${b4.id}/payments`, { mode: 'CASH', amount: b4.total + 100000, idempotencyKey: `over-${b4.id}`.slice(0, 70) });
  check(over.status === 422, `overpay -> 422 (got ${over.status})`);

  // --- [5] pay-before-finalize 409 ---
  console.log('\n[5] pay before finalize rejected:');
  const o5 = await newOrder(outletId, item.id, 1);
  const b5 = (await api('POST', '/bills', { orderId: o5.id })).json; // DRAFT
  const early = await api('POST', `/bills/${b5.id}/payments`, { mode: 'CASH', amount: b5.total, idempotencyKey: `early-${b5.id}`.slice(0, 70) });
  check(early.status === 409, `pay before finalize -> 409 (got ${early.status})`);

  console.log(`\n==== BILLING E2E VERDICT: ${failures === 0 ? 'PASS' : `FAIL (${failures})`} ====`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('BILLING E2E RUNNER ERROR:', e); process.exit(1); });
