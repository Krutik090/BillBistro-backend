import { ConflictException, NotFoundException, UnprocessableEntityException } from '../utils/errors';
import { Prisma } from '@prisma/client';
import { AuditService } from './audit.service';
import { PrismaService } from '../database/client';
import { currentContext, requireTenantId } from '../context/tenant-context';
import { roundToRupee, splitShares } from '../utils/pricing';
import * as S from '../schemas/billing.schemas';

const live = { deletedAt: null } as const;
type Tx = Prisma.TransactionClient;

const billInclude = {
  lines: { where: live, orderBy: { createdAt: 'asc' as const } },
  payments: { where: live, orderBy: { createdAt: 'asc' as const } },
  refunds: { where: live, orderBy: { createdAt: 'asc' as const } },
  order: { select: { id: true, orderNo: true, type: true, tableRef: true, tableId: true, status: true } },
} satisfies Prisma.BillInclude;

/** Business date (YYYY-MM-DD) of `at` in the tenant's timezone. */
export function businessDateOf(at: Date, timeZone: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

/**
 * Bill = frozen, share-scaled snapshot of one (or several merged) orders' lines with GST breakdown.
 * All math here; the client only ever sends discount / tip / payment.amount, which are validated.
 */
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  private get db() {
    return this.prisma.scoped;
  }

  // ---------- reads ----------
  list(q: S.ListBillsQuery) {
    return this.db.bill.findMany({
      where: {
        ...live,
        ...(q.outletId ? { outletId: q.outletId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.orderId ? { OR: [{ orderId: q.orderId }, { mergedOrderIds: { has: q.orderId } }] } : {}),
        ...(q.businessDate ? { businessDate: q.businessDate } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      include: { order: { select: { orderNo: true, tableRef: true } }, _count: { select: { payments: true } } },
    });
  }
  async get(id: string) {
    const b = await this.db.bill.findFirst({ where: { id, ...live }, include: billInclude });
    if (!b) throw new NotFoundException('Bill not found');
    return this.shape(b);
  }

  // ---------- create (from order, optional merge / split) ----------
  async create(d: S.CreateBill) {
    const tid = requireTenantId();
    const userId = currentContext()?.userId ?? null;
    return this.prisma.withTenant(tid, async (tx) => {
      if (d.clientKey) {
        const existing = await tx.bill.findFirst({ where: { clientKey: d.clientKey }, include: billInclude });
        if (existing?.deletedAt) throw new ConflictException('clientKey already used');
        if (existing) return this.shape(existing);
      }
      const orderIds = [d.orderId, ...(d.mergeOrderIds ?? []).filter((x) => x !== d.orderId)];
      if (d.splitOf && orderIds.length > 1) throw new UnprocessableEntityException('Cannot split a merged bill');
      const orders = await tx.order.findMany({ where: { id: { in: orderIds }, ...live }, include: { items: { where: live, include: { item: { select: { hsnCode: true } } } } } });
      if (orders.length !== orderIds.length) throw new NotFoundException('Order not found');
      const outletId = orders[0].outletId;
      for (const o of orders) {
        if (o.outletId !== outletId) throw new UnprocessableEntityException('Orders belong to different outlets');
        if (o.status !== 'OPEN' && o.status !== 'BILLED') throw new ConflictException(`Order ${o.orderNo} is ${o.status}`);
        if (!o.items.length) throw new UnprocessableEntityException(`Order ${o.orderNo} has no lines`);
      }
      // existing non-void bills on these orders: block duplicates (allow the other shares of a split)
      const others = await tx.bill.findMany({ where: { status: { not: 'VOID' }, OR: [{ orderId: { in: orderIds } }, { mergedOrderIds: { hasSome: orderIds } }] } });
      if (d.splitOf) {
        if (others.some((b) => b.splitCount !== d.splitOf!.count)) throw new ConflictException('Order already billed with a different split');
        if (others.some((b) => b.splitIndex === d.splitOf!.index + 1)) throw new ConflictException('This share is already billed');
      } else if (others.length) {
        throw new ConflictException(`Order already has bill ${others[0].billNo}`);
      }

      const lines = orders.flatMap((o) => o.items);
      const computed = this.compute(lines, d.discount ?? 0, d.tip ?? 0, d.splitOf);
      const billNo = await this.nextNo(tx, tid, outletId, 'bill', 'B');
      const bill = await tx.bill.create({
        data: {
          tenantId: tid,
          outletId,
          orderId: d.orderId,
          mergedOrderIds: orderIds.slice(1),
          billNo: d.splitOf ? `${billNo}/${d.splitOf.index + 1}` : billNo,
          splitIndex: d.splitOf ? d.splitOf.index + 1 : null,
          splitCount: d.splitOf?.count ?? null,
          discountNote: d.discountNote,
          clientKey: d.clientKey,
          createdById: userId,
          ...computed.totals,
          lines: { create: computed.lines.map((l) => ({ ...l, tenantId: tid })) },
        },
      });
      await this.audit.recordIn(tx, { action: 'bill.create', entity: 'bills', entityId: bill.id, after: { billNo: bill.billNo, ...computed.totals, orders: orderIds } });
      if ((d.discount ?? 0) > 0) {
        await this.audit.recordIn(tx, { action: 'bill.discount', entity: 'bills', entityId: bill.id, after: { discount: computed.totals.discount, note: d.discountNote ?? null } });
      }
      return this.get_(tx, bill.id);
    });
  }

  // ---------- adjust draft (discount / tip) ----------
  async update(id: string, d: S.UpdateBill) {
    const tid = requireTenantId();
    return this.prisma.withTenant(tid, async (tx) => {
      const bill = await this.mustBill(tx, id, ['DRAFT'], d.version);
      const orderIds = [bill.orderId, ...bill.mergedOrderIds];
      const items = await tx.orderItem.findMany({ where: { orderId: { in: orderIds }, ...live }, include: { item: { select: { hsnCode: true } } } });
      const split = bill.splitIndex ? { index: bill.splitIndex - 1, count: bill.splitCount! } : undefined;
      const computed = this.compute(items, d.discount ?? bill.discount, d.tip ?? bill.tip, split);
      await tx.billLine.updateMany({ where: { billId: id }, data: { deletedAt: new Date() } });
      const updated = await tx.bill.update({
        where: { id },
        data: { ...computed.totals, discountNote: d.discountNote ?? bill.discountNote, version: { increment: 1 }, lines: { create: computed.lines.map((l) => ({ ...l, tenantId: tid })) } },
      });
      if (d.discount !== undefined && d.discount !== bill.discount) {
        await this.audit.recordIn(tx, { action: 'bill.discount', entity: 'bills', entityId: id, before: { discount: bill.discount }, after: { discount: updated.discount, note: d.discountNote ?? null } });
      }
      return this.get_(tx, id);
    });
  }

  // ---------- finalize ----------
  async finalize(id: string, d: S.Finalize) {
    const tid = requireTenantId();
    return this.prisma.withTenant(tid, async (tx) => {
      const bill = await this.mustBill(tx, id, ['DRAFT'], d.version);
      const businessDate = await this.openBusinessDate(tx, tid, bill.outletId);
      await tx.bill.update({ where: { id }, data: { status: 'FINAL', finalizedAt: new Date(), businessDate, version: { increment: 1 } } });
      const orderIds = [bill.orderId, ...bill.mergedOrderIds];
      await tx.order.updateMany({ where: { id: { in: orderIds }, status: 'OPEN' }, data: { status: 'BILLED', discount: bill.discount } });
      const orders = await tx.order.findMany({ where: { id: { in: orderIds } }, select: { tableId: true } });
      const tableIds = orders.map((o) => o.tableId).filter((x): x is string => !!x);
      if (tableIds.length) await tx.restaurantTable.updateMany({ where: { id: { in: tableIds }, status: 'OCCUPIED' }, data: { status: 'BILLED', statusSince: new Date(), version: { increment: 1 } } });
      await this.audit.recordIn(tx, { action: 'bill.finalize', entity: 'bills', entityId: id, after: { billNo: bill.billNo, total: bill.total, businessDate } });
      if (bill.total === 0) await this.settle(tx, id);
      return this.get_(tx, id);
    });
  }

  // ---------- void ----------
  async void(id: string, d: S.VoidBill) {
    const tid = requireTenantId();
    return this.prisma.withTenant(tid, async (tx) => {
      const bill = await this.mustBill(tx, id, ['DRAFT', 'FINAL']);
      if (bill.paidTotal - bill.refundTotal > 0) throw new ConflictException('Refund payments before voiding');
      if (bill.businessDate) await this.openBusinessDate(tx, tid, bill.outletId, bill.businessDate);
      await tx.bill.update({ where: { id }, data: { status: 'VOID', voidedAt: new Date(), voidReason: d.reason, version: { increment: 1 } } });
      const orderIds = [bill.orderId, ...bill.mergedOrderIds];
      const remaining = await tx.bill.count({ where: { status: { not: 'VOID' }, OR: [{ orderId: { in: orderIds } }, { mergedOrderIds: { hasSome: orderIds } }] } });
      if (remaining === 0) {
        await tx.order.updateMany({ where: { id: { in: orderIds }, status: 'BILLED' }, data: { status: 'OPEN', discount: 0 } });
        const orders = await tx.order.findMany({ where: { id: { in: orderIds } }, select: { tableId: true } });
        const tableIds = orders.map((o) => o.tableId).filter((x): x is string => !!x);
        if (tableIds.length) await tx.restaurantTable.updateMany({ where: { id: { in: tableIds }, status: 'BILLED' }, data: { status: 'OCCUPIED', statusSince: new Date(), version: { increment: 1 } } });
      }
      await this.audit.recordIn(tx, { action: 'bill.void', entity: 'bills', entityId: id, before: { status: bill.status, total: bill.total }, after: { status: 'VOID' }, meta: { reason: d.reason } });
      return this.get_(tx, id);
    });
  }

  // ---------- payments ----------
  async pay(billId: string, d: S.CreatePayment) {
    const tid = requireTenantId();
    const userId = currentContext()?.userId ?? null;
    return this.prisma.withTenant(tid, async (tx) => {
      const replay = await tx.payment.findFirst({ where: { idempotencyKey: d.idempotencyKey } });
      if (replay?.deletedAt) throw new ConflictException('idempotencyKey already used');
      if (replay) {
        if (replay.billId !== billId) throw new ConflictException('idempotencyKey already used for another bill');
        return replay;
      }
      const bill = await this.mustBill(tx, billId, ['FINAL']);
      const businessDate = await this.openBusinessDate(tx, tid, bill.outletId, bill.businessDate ?? undefined);
      const due = bill.total - bill.paidTotal;
      if (d.amount > due) throw new UnprocessableEntityException({ message: 'Amount exceeds amount due', due });
      if (d.mode === 'CASH' && d.tendered !== undefined && d.tendered < d.amount) throw new UnprocessableEntityException('Tendered is less than amount');
      if (d.mode !== 'CASH' && !d.reference) throw new UnprocessableEntityException(`${d.mode} payment needs a reference (UTR / slip no)`);
      const payment = await tx.payment.create({
        data: { tenantId: tid, billId, mode: d.mode, status: 'CAPTURED', amount: d.amount, tendered: d.mode === 'CASH' ? (d.tendered ?? d.amount) : null, reference: d.reference ?? null, idempotencyKey: d.idempotencyKey, businessDate, receivedById: userId },
      });
      const paidTotal = bill.paidTotal + d.amount;
      await tx.bill.update({ where: { id: billId }, data: { paidTotal, version: { increment: 1 } } });
      await this.audit.recordIn(tx, { action: 'payment.capture', entity: 'payments', entityId: payment.id, after: { billId, mode: d.mode, amount: d.amount, reference: d.reference ?? null, paidTotal, due: bill.total - paidTotal } });
      if (paidTotal >= bill.total) await this.settle(tx, billId);
      return { ...payment, change: payment.tendered != null ? payment.tendered - payment.amount : 0, due: bill.total - paidTotal };
    });
  }

  async refund(paymentId: string, d: S.CreateRefund) {
    const tid = requireTenantId();
    const userId = currentContext()?.userId ?? null;
    return this.prisma.withTenant(tid, async (tx) => {
      const replay = await tx.refund.findFirst({ where: { idempotencyKey: d.idempotencyKey } });
      if (replay?.deletedAt) throw new ConflictException('idempotencyKey already used');
      if (replay) return replay;
      const payment = await tx.payment.findFirst({ where: { id: paymentId, ...live } });
      if (!payment) throw new NotFoundException('Payment not found');
      const refundable = payment.amount - payment.refundedTotal;
      if (d.amount > refundable) throw new UnprocessableEntityException({ message: 'Amount exceeds refundable balance', refundable });
      const bill = await this.mustBill(tx, payment.billId, ['FINAL', 'SETTLED']);
      const businessDate = await this.openBusinessDate(tx, tid, bill.outletId);
      const refund = await tx.refund.create({ data: { tenantId: tid, billId: bill.id, paymentId, amount: d.amount, reason: d.reason, reference: d.reference ?? null, idempotencyKey: d.idempotencyKey, businessDate, createdById: userId } });
      const refundedTotal = payment.refundedTotal + d.amount;
      await tx.payment.update({ where: { id: paymentId }, data: { refundedTotal, status: refundedTotal >= payment.amount ? 'REFUNDED' : 'CAPTURED' } });
      await tx.bill.update({ where: { id: bill.id }, data: { refundTotal: bill.refundTotal + d.amount, version: { increment: 1 } } });
      await this.audit.recordIn(tx, { action: 'payment.refund', entity: 'refunds', entityId: refund.id, after: { paymentId, billId: bill.id, amount: d.amount, reason: d.reason, mode: payment.mode } });
      return refund;
    });
  }

  // ---------- receipt payload (80mm) ----------
  async receipt(id: string) {
    const bill = await this.get(id);
    const [outlet, tenant, cashier] = await Promise.all([
      this.db.outlet.findFirstOrThrow({ where: { id: bill.outletId } }),
      this.db.tenant.findFirstOrThrow({ where: { id: bill.tenantId } }),
      bill.createdById ? this.db.user.findFirst({ where: { id: bill.createdById }, select: { name: true } }) : null,
    ]);
    const byRate = new Map<number, { taxable: number; cgst: number; sgst: number }>();
    for (const l of bill.lines) {
      const r = byRate.get(l.taxRateBps) ?? { taxable: 0, cgst: 0, sgst: 0 };
      r.taxable += l.taxable;
      r.cgst += l.cgst;
      r.sgst += l.sgst;
      byRate.set(l.taxRateBps, r);
    }
    return {
      business: { name: tenant.name, gstin: tenant.gstin, currency: tenant.currency },
      outlet: { name: outlet.name, address: outlet.address, phone: outlet.phone },
      bill: { id: bill.id, billNo: bill.billNo, status: bill.status, date: bill.finalizedAt ?? bill.createdAt, businessDate: bill.businessDate, orderNo: bill.order.orderNo, type: bill.order.type, table: bill.order.tableRef, cashier: cashier?.name ?? null, split: bill.splitIndex ? `${bill.splitIndex}/${bill.splitCount}` : null },
      lines: bill.lines.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal, taxRateBps: l.taxRateBps, hsnCode: l.hsnCode })),
      totals: { subtotal: bill.subtotal, discount: bill.discount, taxable: bill.taxable, cgst: bill.cgst, sgst: bill.sgst, taxTotal: bill.taxTotal, tip: bill.tip, roundOff: bill.roundOff, total: bill.total, paid: bill.paidTotal, refunded: bill.refundTotal, due: bill.total - bill.paidTotal },
      taxSummary: [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([bps, r]) => ({ taxRateBps: bps, ...r })),
      payments: bill.payments.map((p) => ({ mode: p.mode, amount: p.amount, tendered: p.tendered, change: p.tendered != null ? p.tendered - p.amount : 0, reference: p.reference, at: p.createdAt })),
      footer: 'Thank you! Visit again.',
    };
  }

  // ---------- day close (Z-report) ----------
  async dayClose(d: S.DayCloseInput) {
    const tid = requireTenantId();
    const userId = currentContext()?.userId ?? null;
    return this.prisma.withTenant(tid, async (tx) => {
      const outlet = await tx.outlet.findFirst({ where: { id: d.outletId, ...live } });
      if (!outlet) throw new NotFoundException('Outlet not found');
      const existing = await tx.dayClose.findUnique({ where: { outletId_businessDate: { outletId: d.outletId, businessDate: d.businessDate } } });
      if (existing && existing.status === 'CLOSED') throw new ConflictException('Day already closed');
      const drafts = await tx.bill.count({ where: { outletId: d.outletId, status: 'DRAFT', ...live } });
      const unpaid = await tx.bill.count({ where: { outletId: d.outletId, status: 'FINAL', businessDate: d.businessDate, ...live } });
      if (unpaid) throw new ConflictException(`${unpaid} finalized bill(s) still unpaid for ${d.businessDate}`);
      const totals = await this.zReport(tx, d.outletId, d.businessDate);
      const row = existing
        ? await tx.dayClose.update({ where: { id: existing.id }, data: { status: 'CLOSED', totals: { ...totals, draftsOpen: drafts }, closedById: userId, closedAt: new Date(), note: d.note } })
        : await tx.dayClose.create({ data: { tenantId: tid, outletId: d.outletId, businessDate: d.businessDate, totals: { ...totals, draftsOpen: drafts }, closedById: userId, note: d.note } });
      await this.audit.recordIn(tx, { action: 'day.close', entity: 'day_closes', entityId: row.id, after: { businessDate: d.businessDate, ...totals } });
      return row;
    });
  }
  async dayReport(q: S.DayCloseQuery) {
    const closed = await this.db.dayClose.findUnique({ where: { outletId_businessDate: { outletId: q.outletId, businessDate: q.businessDate } } });
    const totals = await this.prisma.withTenant(requireTenantId(), (tx) => this.zReport(tx, q.outletId, q.businessDate));
    return { outletId: q.outletId, businessDate: q.businessDate, status: closed?.status ?? 'OPEN', closedAt: closed?.closedAt ?? null, totals };
  }

  private async zReport(tx: Tx, outletId: string, businessDate: string) {
    const bills = await tx.bill.findMany({ where: { outletId, businessDate, status: { in: ['FINAL', 'SETTLED'] }, ...live }, select: { subtotal: true, discount: true, taxable: true, cgst: true, sgst: true, taxTotal: true, tip: true, roundOff: true, total: true, orderId: true, mergedOrderIds: true } });
    const payments = await tx.payment.findMany({ where: { businessDate, bill: { outletId }, ...live }, select: { mode: true, amount: true } });
    const refunds = await tx.refund.findMany({ where: { businessDate, bill: { outletId }, ...live }, select: { amount: true, payment: { select: { mode: true } } } });
    const voids = await tx.bill.count({ where: { outletId, status: 'VOID', voidedAt: { not: null }, ...live, OR: [{ businessDate }, { businessDate: null, updatedAt: { gte: new Date(businessDate) } }] } });
    const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
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
      cashExpected: (byMode.CASH?.collected ?? 0) - (byMode.CASH?.refunded ?? 0),
    };
  }

  // ---------- money ----------
  /**
   * Freeze lines (share-scaled for split bills), apply pre-tax discount proportionally, GST per line split CGST/SGST,
   * add tip after tax, round the grand total to the rupee.
   */
  private compute(
    items: Array<{ id: string; name: string; variantName: string | null; qty: number; unitPrice: number; lineTotal: number; taxRateBps: number; item: { hsnCode: string | null } }>,
    discount: number,
    tip: number,
    split?: { index: number; count: number },
  ) {
    const share = (x: number) => (split ? splitShares(x, split.count)[split.index] : x);
    const lines0 = items.map((it) => ({ orderItemId: it.id, name: it.variantName ? `${it.name} (${it.variantName})` : it.name, qty: it.qty, unitPrice: it.unitPrice, lineTotal: share(it.lineTotal), taxRateBps: it.taxRateBps, hsnCode: it.item.hsnCode }));
    const subtotal = lines0.reduce((s, l) => s + l.lineTotal, 0);
    const fullSubtotal = items.reduce((s, it) => s + it.lineTotal, 0);
    const disc = share(Math.min(Math.max(0, discount), fullSubtotal));
    const ratio = subtotal > 0 ? disc / subtotal : 0;
    let allocated = 0;
    const lines = lines0.map((l, i) => {
      const lineDisc = i === lines0.length - 1 ? disc - allocated : Math.round(l.lineTotal * ratio);
      allocated += lineDisc;
      const taxable = l.lineTotal - lineDisc;
      const tax = Math.round((taxable * l.taxRateBps) / 10000);
      const cgst = Math.floor(tax / 2);
      return { ...l, discount: lineDisc, taxable, cgst, sgst: tax - cgst };
    });
    const taxable = subtotal - disc;
    const cgst = lines.reduce((s, l) => s + l.cgst, 0);
    const sgst = lines.reduce((s, l) => s + l.sgst, 0);
    const taxTotal = cgst + sgst;
    const tipShare = share(Math.max(0, tip));
    const { total, roundOff } = roundToRupee(taxable + taxTotal + tipShare);
    return { lines, totals: { subtotal, discount: disc, taxable, taxTotal, cgst, sgst, tip: tipShare, roundOff, total } };
  }

  // ---------- helpers ----------
  private async settle(tx: Tx, billId: string) {
    const bill = await tx.bill.update({ where: { id: billId }, data: { status: 'SETTLED', settledAt: new Date() } });
    const orderIds = [bill.orderId, ...bill.mergedOrderIds];
    // order is settled when every non-void bill on it is settled and (for splits) all shares exist
    const bills = await tx.bill.findMany({ where: { status: { not: 'VOID' }, OR: [{ orderId: { in: orderIds } }, { mergedOrderIds: { hasSome: orderIds } }] } });
    const allSettled = bills.every((b) => b.status === 'SETTLED') && (!bill.splitCount || bills.length === bill.splitCount);
    if (allSettled) {
      await tx.order.updateMany({ where: { id: { in: orderIds } }, data: { status: 'SETTLED' } });
      const orders = await tx.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, tableId: true } });
      for (const o of orders) {
        if (o.tableId) await tx.restaurantTable.updateMany({ where: { id: o.tableId, currentOrderId: o.id }, data: { status: 'FREE', statusSince: new Date(), currentOrderId: null, version: { increment: 1 } } });
      }
      await this.audit.recordIn(tx, { action: 'bill.settle', entity: 'bills', entityId: billId, after: { orders: orderIds } });
    }
  }

  private async mustBill(tx: Tx, id: string, statuses: string[], version?: number) {
    const b = await tx.bill.findFirst({ where: { id, ...live } });
    if (!b) throw new NotFoundException('Bill not found');
    if (!statuses.includes(b.status)) throw new ConflictException(`Bill is ${b.status}`);
    if (version !== undefined && version !== b.version) throw new ConflictException({ message: 'Stale bill version', current: b.version });
    return b;
  }

  /** Today's business date for the outlet; throws if that date is already closed. */
  private async openBusinessDate(tx: Tx, tid: string, outletId: string, date?: string) {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tid }, select: { timezone: true } });
    const bd = date ?? businessDateOf(new Date(), tenant.timezone);
    const closed = await tx.dayClose.findUnique({ where: { outletId_businessDate: { outletId, businessDate: bd } } });
    if (closed?.status === 'CLOSED') throw new ConflictException(`Business date ${bd} is closed for this outlet`);
    return bd;
  }

  private async nextNo(tx: Tx, tid: string, outletId: string, key: string, prefix = ''): Promise<string> {
    await tx.$executeRaw`INSERT INTO sequences (id, tenant_id, outlet_id, key, value, created_at, updated_at)
      VALUES (gen_random_uuid(), ${tid}::uuid, ${outletId}::uuid, ${key}, 0, now(), now()) ON CONFLICT (outlet_id, key) DO NOTHING`;
    const rows = await tx.$queryRaw<{ value: number }[]>`UPDATE sequences SET value = value + 1, updated_at = now() WHERE outlet_id = ${outletId}::uuid AND key = ${key} RETURNING value`;
    return `${prefix}${String(rows[0].value).padStart(6, '0')}`;
  }

  private async get_(tx: Tx, id: string) {
    return this.shape(await tx.bill.findUniqueOrThrow({ where: { id }, include: billInclude }));
  }
  private shape(b: Prisma.BillGetPayload<{ include: typeof billInclude }>) {
    return { ...b, due: b.total - b.paidTotal };
  }
}
