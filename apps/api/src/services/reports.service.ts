import { PrismaService } from '../database/client';
import * as S from '../schemas/reports.schemas';

const live = { deletedAt: null } as const;
const settled = { in: ['FINAL', 'SETTLED'] as ('FINAL' | 'SETTLED')[] };
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

/**
 * Read-only sales/item/tax analytics over a date range (Phase 1, T-104). Reuses the money
 * already frozen on bills/bill_lines/payments at finalize time — no new domain concepts.
 */
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}
  private get db() {
    return this.prisma.scoped;
  }

  /** Sales summary: gross/discount/tax/tip/net, collections by payment mode, voids. Range-generalised day-close Z-report. */
  async sales(q: S.ReportRangeQuery) {
    const range = { gte: q.from, lte: q.to };
    const bills = await this.db.bill.findMany({
      where: { outletId: q.outletId, businessDate: range, status: settled, ...live },
      select: { subtotal: true, discount: true, taxable: true, cgst: true, sgst: true, taxTotal: true, tip: true, roundOff: true, total: true, orderId: true, mergedOrderIds: true },
    });
    const payments = await this.db.payment.findMany({ where: { businessDate: range, bill: { outletId: q.outletId }, ...live }, select: { mode: true, amount: true } });
    const refunds = await this.db.refund.findMany({ where: { businessDate: range, bill: { outletId: q.outletId }, ...live }, select: { amount: true, payment: { select: { mode: true } } } });
    const voids = await this.db.bill.count({ where: { outletId: q.outletId, status: 'VOID', businessDate: range, ...live } });
    const byMode: Record<string, { collected: number; refunded: number; count: number }> = {};
    for (const p of payments) {
      byMode[p.mode] ??= { collected: 0, refunded: 0, count: 0 };
      byMode[p.mode].collected += p.amount;
      byMode[p.mode].count++;
    }
    for (const r of refunds) {
      byMode[r.payment.mode] ??= { collected: 0, refunded: 0, count: 0 };
      byMode[r.payment.mode].refunded += r.amount;
    }
    return {
      outletId: q.outletId,
      from: q.from,
      to: q.to,
      bills: bills.length,
      orders: new Set(bills.flatMap((b) => [b.orderId, ...b.mergedOrderIds])).size,
      grossSales: sum(bills, (b) => b.subtotal),
      discounts: sum(bills, (b) => b.discount),
      taxableSales: sum(bills, (b) => b.taxable),
      cgst: sum(bills, (b) => b.cgst),
      sgst: sum(bills, (b) => b.sgst),
      taxTotal: sum(bills, (b) => b.taxTotal),
      tips: sum(bills, (b) => b.tip),
      roundOff: sum(bills, (b) => b.roundOff),
      netSales: sum(bills, (b) => b.total),
      collected: sum(payments, (p) => p.amount),
      refunded: sum(refunds, (r) => r.amount),
      byMode,
      voids,
    };
  }

  /** Item-wise sales: qty + revenue per menu line (grouped by the frozen bill-line name). */
  async items(q: S.ReportRangeQuery) {
    const lines = await this.db.billLine.findMany({
      where: { bill: { outletId: q.outletId, businessDate: { gte: q.from, lte: q.to }, status: settled, deletedAt: null }, ...live },
      select: { name: true, qty: true, lineTotal: true, discount: true, taxable: true, cgst: true, sgst: true },
    });
    const byName = new Map<string, { qty: number; grossAmount: number; discount: number; taxable: number; tax: number }>();
    for (const l of lines) {
      const r = byName.get(l.name) ?? { qty: 0, grossAmount: 0, discount: 0, taxable: 0, tax: 0 };
      r.qty += l.qty;
      r.grossAmount += l.lineTotal;
      r.discount += l.discount;
      r.taxable += l.taxable;
      r.tax += l.cgst + l.sgst;
      byName.set(l.name, r);
    }
    const items = [...byName.entries()]
      .map(([name, r]) => ({ name, ...r, netAmount: r.taxable + r.tax }))
      .sort((a, b) => b.netAmount - a.netAmount);
    return { outletId: q.outletId, from: q.from, to: q.to, items };
  }

  /** GST summary by rate bracket, for filing: taxable value + CGST + SGST per rate. */
  async tax(q: S.ReportRangeQuery) {
    const lines = await this.db.billLine.findMany({
      where: { bill: { outletId: q.outletId, businessDate: { gte: q.from, lte: q.to }, status: settled, deletedAt: null }, ...live },
      select: { taxRateBps: true, taxable: true, cgst: true, sgst: true },
    });
    const byRate = new Map<number, { taxable: number; cgst: number; sgst: number }>();
    for (const l of lines) {
      const r = byRate.get(l.taxRateBps) ?? { taxable: 0, cgst: 0, sgst: 0 };
      r.taxable += l.taxable;
      r.cgst += l.cgst;
      r.sgst += l.sgst;
      byRate.set(l.taxRateBps, r);
    }
    const brackets = [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([taxRateBps, r]) => ({ taxRateBps, ...r, tax: r.cgst + r.sgst }));
    const totals = brackets.reduce((s, b) => ({ taxable: s.taxable + b.taxable, cgst: s.cgst + b.cgst, sgst: s.sgst + b.sgst, tax: s.tax + b.tax }), { taxable: 0, cgst: 0, sgst: 0, tax: 0 });
    return { outletId: q.outletId, from: q.from, to: q.to, brackets, totals };
  }
}
