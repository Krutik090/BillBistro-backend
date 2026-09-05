/**
 * Pure money math — the single source of truth (mirrors packages/sdk mock.ts; the SERVER wins on any mismatch).
 * All amounts are integer paise. Tax rates are basis points (500 = 5%).
 */
export interface PricedLine {
  unitPrice: number; // base/outlet price + variant delta + modifier prices
  qty: number;
  taxRateBps: number;
}

export const lineTotal = (l: PricedLine) => l.unitPrice * l.qty;

/** Tax for a line after a proportional pre-tax discount has been applied to the whole order. */
export function lineTax(l: PricedLine, discountRatio = 0): number {
  const taxable = lineTotal(l) * (1 - discountRatio);
  return Math.round((taxable * l.taxRateBps) / 10000);
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  taxTotal: number;
  total: number;
}

/** Order-level totals. `discount` is an absolute paise amount applied BEFORE tax, proportionally across lines. */
export function orderTotals(lines: PricedLine[], discount = 0): OrderTotals {
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const disc = Math.min(Math.max(0, discount), subtotal);
  const ratio = subtotal > 0 ? disc / subtotal : 0;
  const taxTotal = lines.reduce((s, l) => s + lineTax(l, ratio), 0);
  return { subtotal, discount: disc, taxTotal, total: subtotal - disc + taxTotal };
}

/** Round to the nearest rupee (100 paise). Returns the rounded total and the signed round-off. */
export function roundToRupee(raw: number): { total: number; roundOff: number } {
  const total = Math.round(raw / 100) * 100;
  return { total, roundOff: total - raw };
}

/** Split `amount` into `count` shares that sum exactly; the last share absorbs the paise remainder. */
export function splitShares(amount: number, count: number): number[] {
  if (count < 1) throw new Error('count must be >= 1');
  const base = Math.round(amount / count);
  const shares = Array.from({ length: count }, () => base);
  shares[count - 1] = amount - base * (count - 1);
  return shares;
}
