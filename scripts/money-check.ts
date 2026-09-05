/* Money/GST correctness (T-120, Dwight) — verifies the SERVER pure money math
 * (apps/api/src/utils/pricing.ts) against the AGREED spec:
 *   - amounts are integer paise; tax rates basis points (500 = 5%)
 *   - per-line tax = round(lineTotal * (1 - discountRatio) * bps / 10000)  [discount-before-tax, PER-LINE rounding]
 *   - orderTotals: subtotal = Σ lineTotal; discount clamped to [0, subtotal]; total = subtotal - discount + taxTotal
 *   - roundToRupee: nearest 100 paise, signed round-off
 *   - splitShares: shares sum EXACTLY to amount; last absorbs the remainder
 *
 * Pure functions -> runs reliably (no API/DB/prisma; no shared-node_modules race).
 * The spec is re-implemented INDEPENDENTLY below and cross-checked against pricing.ts over
 * fixed golden cases + a wide deterministic sweep. Any mismatch = a real money bug in the server.
 */
import { lineTotal, lineTax, orderTotals, roundToRupee, splitShares, type PricedLine } from '../apps/api/src/utils/pricing';

let failures = 0;
const check = (cond: boolean, label: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++; };
const isInt = (n: number) => Number.isInteger(n);

// Independent spec re-implementation (the oracle).
const specLineTax = (l: PricedLine, ratio = 0) => Math.round((l.unitPrice * l.qty * (1 - ratio) * l.taxRateBps) / 10000);
function specTotals(lines: PricedLine[], discount = 0) {
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const disc = Math.min(Math.max(0, discount), subtotal);
  const ratio = subtotal > 0 ? disc / subtotal : 0;
  const taxTotal = lines.reduce((s, l) => s + specLineTax(l, ratio), 0);
  return { subtotal, discount: disc, taxTotal, total: subtotal - disc + taxTotal };
}

function main() {
  console.log('[1] Golden cases (hand-computed):');
  check(lineTotal({ unitPrice: 32000, qty: 2, taxRateBps: 500 }) === 64000, 'lineTotal 320.00 x2 = 640.00');
  check(lineTax({ unitPrice: 10000, qty: 1, taxRateBps: 500 }) === 500, '5% tax on 100.00 = 5.00');
  check(lineTax({ unitPrice: 6000, qty: 1, taxRateBps: 1800 }) === 1080, '18% (drinks) tax on 60.00 = 10.80');
  check(lineTax({ unitPrice: 12345, qty: 1, taxRateBps: 500 }) === 617, '5% on 123.45 = 6.1725 -> round 6.17');
  check(lineTax({ unitPrice: 12345, qty: 1, taxRateBps: 500 }, 0.2) === 494, '5% on 123.45 @20% off = 4.938 -> round 4.94');

  const t0 = orderTotals([{ unitPrice: 10000, qty: 1, taxRateBps: 500 }, { unitPrice: 6000, qty: 2, taxRateBps: 1800 }]);
  check(t0.subtotal === 22000 && t0.taxTotal === 2660 && t0.total === 24660 && t0.discount === 0, `order no-discount: sub 220 tax 26.60 total 246.60 (got ${JSON.stringify(t0)})`);

  const t1 = orderTotals([{ unitPrice: 10000, qty: 1, taxRateBps: 500 }, { unitPrice: 6000, qty: 2, taxRateBps: 1800 }], 2000);
  check(t1.discount === 2000 && t1.total === t1.subtotal - t1.discount + t1.taxTotal, `order w/discount: total = sub - disc + tax (got ${JSON.stringify(t1)})`);

  console.log('[2] Discount clamping + invariants:');
  const over = orderTotals([{ unitPrice: 5000, qty: 1, taxRateBps: 500 }], 999999);
  check(over.discount === 5000, 'discount clamps to subtotal (no negative total)');
  check(orderTotals([], 100).subtotal === 0 && orderTotals([], 100).discount === 0, 'empty order: zero subtotal, zero discount (no div-by-zero)');

  console.log('[3] roundToRupee (nearest 100 paise, signed round-off):');
  for (const [raw, exp, off] of [[22419, 22400, -19], [12350, 12400, 50], [12349, 12300, -49], [100, 100, 0]] as const) {
    const r = roundToRupee(raw);
    check(r.total === exp && r.roundOff === off && r.total % 100 === 0, `round ${raw} -> ${r.total} (off ${r.roundOff})`);
  }

  console.log('[4] splitShares — sum EXACT, last absorbs remainder:');
  for (const [amt, n] of [[10000, 3], [10001, 3], [100, 1], [0, 4], [12347, 7], [999, 4]] as const) {
    const sh = splitShares(amt, n);
    check(sh.length === n && sh.reduce((a, b) => a + b, 0) === amt && sh.every(isInt), `split ${amt}/${n} sums exact & integer (${sh.join(',')})`);
  }

  console.log('[5] Server pricing.ts == independent spec oracle (deterministic sweep):');
  let mism = 0;
  for (let u = 1; u <= 60; u++) {
    const lines: PricedLine[] = [
      { unitPrice: u * 137 + 3, qty: (u % 3) + 1, taxRateBps: u % 2 ? 500 : 1800 },
      { unitPrice: u * 911 + 7, qty: (u % 4) + 1, taxRateBps: u % 3 ? 500 : 1200 },
    ];
    const disc = (u * 173) % (lines.reduce((s, l) => s + l.unitPrice * l.qty, 0) + 1);
    const a = orderTotals(lines, disc), b = specTotals(lines, disc);
    if (JSON.stringify(a) !== JSON.stringify(b)) { mism++; if (mism <= 3) console.log(`    MISMATCH u=${u}: server=${JSON.stringify(a)} spec=${JSON.stringify(b)}`); }
    if (!(isInt(a.subtotal) && isInt(a.taxTotal) && isInt(a.total) && isInt(a.discount))) { mism++; }
  }
  check(mism === 0, `60 sweeps: server matches spec & all totals integer (mismatches: ${mism})`);

  console.log(`\n==== MONEY VERDICT: ${failures === 0 ? 'PASS' : `FAIL (${failures})`} ====`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
