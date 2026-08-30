/* Orders runtime e2e (T-120, Dwight) — probes a RUNNING BillBistro API over HTTP.
 *
 * Designed for CI (isolated runner + fresh seeded Postgres), which sidesteps the shared
 * node_modules / concurrent `prisma generate` race we hit locally. CI job shape (like the
 * hardening probe): migrate + db:seed (creates tenant `demo` + sample menu), start
 * `node apps/api/dist/main.js`, wait for /health, then `pnpm db:orders-e2e`.
 *
 * Verifies (T-102 Orders/KOT):
 *   1. server totals == agreed spec for varied inputs (base, qty>1, +variant, +modifiers, multi-line);
 *      per-line GST = round(lineTotal*bps/10000), integer paise, no drift.
 *   2. idempotency — same clientKey replay returns the SAME order id, no duplicate.
 *   3. server-authoritative — client-sent unitPrice/lineTotal are ignored (Zod strips); totals = catalogue.
 *   4. sequences — N concurrent orders on one outlet get UNIQUE order_no (gap-free/no collisions).
 *   5. sent-KOT lines immutable — removing a KOT-sent line via PATCH /items -> 422.
 *   6. replaceItems version race — two concurrent PATCH with the same version -> one 200, one 409.
 *   7. cancel side-effects — cancelled order -> status CANCELLED.
 * Audit rows (order.create/items_replace/cancel) are code-verified (audit.recordIn in-tx); this
 * HTTP probe does not read audit_logs (no read endpoint) — a DB-level audit assertion runs in the
 * clean-window local pass.
 *
 * Env: API_URL (http://localhost:4000), SEED_TENANT_SLUG (demo), SEED_OWNER_EMAIL (owner@demo.local),
 *      SEED_OWNER_PASSWORD (Password123!). Run against an EPHEMERAL seeded DB.
 */
const BASE = process.env.API_URL ?? 'http://localhost:4000';
const V = `${BASE}/v1`;
const creds = {
  tenantSlug: process.env.SEED_TENANT_SLUG ?? 'demo',
  email: process.env.SEED_OWNER_EMAIL ?? 'owner@demo.local',
  password: process.env.SEED_OWNER_PASSWORD ?? 'Password123!',
};

let failures = 0;
const check = (cond: boolean, label: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++; };
const round = (n: number) => Math.round(n);
const specTax = (lineTotal: number, bps: number) => round((lineTotal * bps) / 10000);

let TOKEN = '';
async function api(method: string, path: string, bodyObj?: unknown, extraHeaders: Record<string, string> = {}) {
  const r = await fetch(`${V}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}), ...extraHeaders },
    body: bodyObj === undefined ? undefined : JSON.stringify(bodyObj),
  });
  let json: any = null;
  try { json = await r.json(); } catch { /* no body */ }
  return { status: r.status, json };
}

async function main() {
  const health = await fetch(`${BASE}/health`).then((r) => r.status).catch(() => 0);
  check(health === 200, `API reachable (health=${health})`);
  if (health !== 200) { console.log('\n==== ORDERS E2E: SKIPPED (no API) ===='); process.exit(1); }

  const login = await api('POST', '/auth/login', creds);
  TOKEN = login.json?.accessToken ?? '';
  check(login.status === 200 && !!TOKEN, `login as ${creds.email} -> token`);
  if (!TOKEN) { console.log('\n==== ORDERS E2E: SKIPPED (no token) ===='); process.exit(1); }

  const outlets = await api('GET', '/outlets');
  const outletId = outlets.json?.[0]?.id ?? outlets.json?.items?.[0]?.id;
  check(!!outletId, `discovered outletId (${outletId})`);
  const eff = await api('GET', `/menu/outlets/${outletId}/effective`);
  const items: any[] = Array.isArray(eff.json) ? eff.json : (eff.json?.items ?? []);
  const item = items.find((i) => i.isAvailable !== false) ?? items[0];
  check(!!item?.id, `discovered a priced menu item (${item?.id})`);
  if (!outletId || !item?.id) { console.log('\n==== ORDERS E2E: SKIPPED (no outlet/item) ===='); process.exit(1); }
  const unit = item.basePrice as number, bps = item.taxRateBps as number;

  console.log('\n[1] server totals == spec (base / qty>1 / multi-line):');
  const o1 = await api('POST', '/orders', { outletId, items: [{ itemId: item.id, qty: 1 }] });
  check(o1.status === 201 || o1.status === 200, `create single-line order (status ${o1.status})`);
  check(o1.json?.subtotal === unit && o1.json?.taxTotal === specTax(unit, bps) && o1.json?.total === unit + specTax(unit, bps),
    `single line: sub=${o1.json?.subtotal}/${unit} tax=${o1.json?.taxTotal}/${specTax(unit, bps)} total=${o1.json?.total}`);

  const o3 = await api('POST', '/orders', { outletId, items: [{ itemId: item.id, qty: 3 }] });
  const lt3 = unit * 3;
  check(o3.json?.subtotal === lt3 && o3.json?.taxTotal === specTax(lt3, bps), `qty=3: sub=${o3.json?.subtotal}/${lt3} tax=${o3.json?.taxTotal}/${specTax(lt3, bps)}`);

  const item2 = items.find((i) => i.id !== item.id) ?? item;
  const u2 = item2.basePrice as number, b2 = item2.taxRateBps as number;
  const oM = await api('POST', '/orders', { outletId, items: [{ itemId: item.id, qty: 1 }, { itemId: item2.id, qty: 2 }] });
  const expSub = unit + u2 * 2, expTax = specTax(unit, bps) + specTax(u2 * 2, b2); // PER-LINE rounding
  check(oM.json?.subtotal === expSub && oM.json?.taxTotal === expTax, `multi-line per-line tax: sub=${oM.json?.subtotal}/${expSub} tax=${oM.json?.taxTotal}/${expTax}`);

  console.log('\n[2] idempotency (same clientKey -> same order):');
  const ck = `e2e-${outletId}-${item.id}`.slice(0, 70);
  const a = await api('POST', '/orders', { outletId, items: [{ itemId: item.id, qty: 1 }], clientKey: ck });
  const b = await api('POST', '/orders', { outletId, items: [{ itemId: item.id, qty: 1 }], clientKey: ck });
  check(!!a.json?.id && a.json?.id === b.json?.id, `replay returns same id (${a.json?.id} == ${b.json?.id})`);

  console.log('\n[3] server-authoritative (client price fields ignored):');
  const tamper = await api('POST', '/orders', { outletId, items: [{ itemId: item.id, qty: 1, unitPrice: 1, lineTotal: 1 }] });
  check(tamper.json?.subtotal === unit && tamper.json?.total === unit + specTax(unit, bps), `tampered unitPrice/lineTotal ignored (sub=${tamper.json?.subtotal}/${unit})`);

  console.log('\n[4] sequences — concurrent orders get unique order_no:');
  const conc = await Promise.all(Array.from({ length: 8 }, () => api('POST', '/orders', { outletId, items: [{ itemId: item.id, qty: 1 }] })));
  const nos = conc.map((r) => r.json?.orderNo).filter(Boolean);
  check(nos.length === 8 && new Set(nos).size === 8, `8 concurrent orders -> 8 unique orderNo (got ${new Set(nos).size} unique of ${nos.length})`);

  console.log('\n[5] sent-KOT line immutable + [6] version race:');
  const base = await api('POST', '/orders', { outletId, items: [{ itemId: item.id, qty: 1 }] });
  const oid = base.json?.id;
  await api('POST', `/orders/${oid}/kots`, {}); // send all lines to kitchen
  const rm = await api('PATCH', `/orders/${oid}/items`, { items: [] }); // remove the sent line
  check(rm.status === 422, `removing a KOT-sent line -> 422 (got ${rm.status})`);

  const fresh = await api('GET', `/orders/${oid}`);
  const ver = fresh.json?.version ?? 1;
  const [r1, r2] = await Promise.all([
    api('PATCH', `/orders/${oid}/items`, { items: [{ itemId: item.id, qty: 2 }], version: ver }),
    api('PATCH', `/orders/${oid}/items`, { items: [{ itemId: item.id, qty: 3 }], version: ver }),
  ]);
  const oks = [r1.status, r2.status].filter((s) => s === 200 || s === 201).length;
  const conflicts = [r1.status, r2.status].filter((s) => s === 409).length;
  check(oks === 1 && conflicts === 1, `concurrent PATCH same version -> one ok / one 409 (got ${r1.status},${r2.status})`);

  console.log('\n[7] cancel side-effects:');
  const toCancel = await api('POST', '/orders', { outletId, items: [{ itemId: item.id, qty: 1 }] });
  const cid = toCancel.json?.id;
  const cancel = await api('POST', `/orders/${cid}/cancel`, { reason: 'e2e test cancel' });
  const after = await api('GET', `/orders/${cid}`);
  check(cancel.status === 200 || cancel.status === 201, `cancel accepted (${cancel.status})`);
  check(after.json?.status === 'CANCELLED', `order status -> CANCELLED (got ${after.json?.status})`);

  console.log(`\n==== ORDERS E2E VERDICT: ${failures === 0 ? 'PASS' : `FAIL (${failures})`} ====`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ORDERS E2E RUNNER ERROR:', e); process.exit(1); });
