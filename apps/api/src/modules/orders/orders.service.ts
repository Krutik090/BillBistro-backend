import { ConflictException, NotFoundException, UnprocessableEntityException } from '../../common/errors';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { currentContext, requireTenantId } from '../../tenancy/tenant-context';
import { orderTotals, PricedLine } from './pricing';
import * as S from './orders.schemas';

const live = { deletedAt: null } as const;
type Tx = Prisma.TransactionClient;

const KOT_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'PREPARING'],
  SERVED: [],
  CANCELLED: [],
};

const orderInclude = {
  items: { where: live, orderBy: { createdAt: 'asc' as const }, include: { modifiers: { where: live } } },
  kots: { where: live, orderBy: { createdAt: 'asc' as const }, include: { items: { where: live, select: { id: true } } } },
  bills: { where: live, select: { id: true, billNo: true, status: true, total: true } },
  table: { select: { id: true, code: true, status: true } },
} satisfies Prisma.OrderInclude;

interface PricedInput extends PricedLine {
  itemId: string;
  name: string;
  variantId: string | null;
  variantName: string | null;
  notes: string | null;
  clientLineId: string | null;
  modifiers: { optionId: string; name: string; price: number }[];
}

/**
 * Orders + KOTs. The server is the money authority: every line is re-priced from the catalogue
 * (outlet price → variant delta → modifier prices), totals are computed here, never trusted from the client.
 */
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  private get db() {
    return this.prisma.scoped;
  }

  // ---------- reads ----------
  list(q: S.ListOrdersQuery) {
    return this.db.order.findMany({
      where: { ...live, ...(q.outletId ? { outletId: q.outletId } : {}), ...(q.status ? { status: q.status } : {}), ...(q.tableId ? { tableId: q.tableId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      include: { table: { select: { id: true, code: true } }, _count: { select: { items: true, kots: true } } },
    });
  }
  async get(id: string) {
    const o = await this.db.order.findFirst({ where: { id, ...live }, include: orderInclude });
    if (!o) throw new NotFoundException('Order not found');
    return this.shape(o);
  }
  listKots(q: S.ListKotsQuery) {
    return this.db.kot.findMany({
      where: { ...live, outletId: q.outletId, ...(q.status ? { status: q.status } : {}), ...(q.station ? { station: q.station } : {}) },
      orderBy: { createdAt: 'asc' },
      include: {
        order: { select: { id: true, orderNo: true, type: true, tableRef: true, table: { select: { code: true } } } },
        items: { where: live, include: { modifiers: { where: live } } },
      },
    });
  }

  // ---------- create ----------
  async create(d: S.CreateOrder) {
    const tid = requireTenantId();
    const userId = currentContext()?.userId ?? null;
    return this.prisma.withTenant(tid, async (tx) => {
      if (d.clientKey) {
        const existing = await tx.order.findFirst({ where: { clientKey: d.clientKey }, include: orderInclude });
        if (existing?.deletedAt) throw new ConflictException('clientKey already used');
        if (existing) return this.shape(existing); // idempotent replay
      }
      let outletId = d.outletId;
      let table: { id: string; code: string; status: string; version: number; outletId: string } | null = null;
      if (d.tableId) {
        table = await tx.restaurantTable.findFirst({ where: { id: d.tableId, ...live, isActive: true } });
        if (!table) throw new NotFoundException('Table not found');
        if (table.status !== 'FREE' && table.status !== 'RESERVED') throw new ConflictException(`Table ${table.code} is ${table.status}`);
        if (outletId && outletId !== table.outletId) throw new UnprocessableEntityException('Table belongs to a different outlet');
        outletId = table.outletId;
      }
      if (!outletId) throw new UnprocessableEntityException('outletId required');
      const outlet = await tx.outlet.findFirst({ where: { id: outletId, ...live } });
      if (!outlet) throw new NotFoundException('Outlet not found');

      const priced = await this.priceLines(tx, outletId, d.items);
      const totals = orderTotals(priced);
      const orderNo = await this.nextNo(tx, tid, outletId, 'order');

      const order = await tx.order.create({
        data: {
          tenantId: tid,
          outletId,
          orderNo,
          type: d.type,
          tableId: table?.id ?? null,
          tableRef: table?.code ?? d.tableRef ?? null,
          guestCount: d.guestCount,
          notes: d.notes,
          clientKey: d.clientKey,
          createdById: userId,
          subtotal: totals.subtotal,
          taxTotal: totals.taxTotal,
          discount: 0,
          total: totals.total,
          items: { create: priced.map((p) => this.lineData(tid, p)) },
        },
      });
      if (table) {
        await tx.restaurantTable.update({
          where: { id: table.id },
          data: { status: 'OCCUPIED', statusSince: new Date(), currentOrderId: order.id, version: { increment: 1 } },
        });
      }
      await this.audit.recordIn(tx, { action: 'order.create', entity: 'orders', entityId: order.id, after: { orderNo, ...totals, lines: priced.length } });
      return this.get_(tx, order.id);
    });
  }

  // ---------- replace lines ----------
  /** Full-list replace. Lines already on a KOT are immutable: they must be present (matched by clientLineId or id) with the same qty/variant. */
  async replaceItems(id: string, d: S.ReplaceItems) {
    const tid = requireTenantId();
    return this.prisma.withTenant(tid, async (tx) => {
      const order = await this.mustOpen(tx, id, d.version);
      await this.claimVersion(tx, id, d.version ?? order.version);
      const existing = await tx.orderItem.findMany({ where: { orderId: id, ...live } });
      const sent = existing.filter((e) => e.kotId);
      const matchesSent = (l: S.OrderLineInput, e: (typeof existing)[number]) => !!l.clientLineId && (l.clientLineId === e.clientLineId || l.clientLineId === e.id);

      const incomingNew: S.OrderLineInput[] = [];
      for (const l of d.items) {
        const e = sent.find((s) => matchesSent(l, s));
        if (!e) {
          incomingNew.push(l);
          continue;
        }
        if (e.qty !== l.qty || (e.variantId ?? null) !== (l.variantId ?? null)) {
          throw new UnprocessableEntityException(`Line ${e.name} is already sent to the kitchen and cannot be changed; cancel it via a void instead`);
        }
      }
      const missingSent = sent.filter((s) => !d.items.some((l) => matchesSent(l, s)));
      if (missingSent.length) throw new UnprocessableEntityException(`Sent lines cannot be removed: ${missingSent.map((m) => m.name).join(', ')}`);

      const before = { subtotal: order.subtotal, taxTotal: order.taxTotal, total: order.total, lines: existing.length };
      const unsentIds = existing.filter((e) => !e.kotId).map((e) => e.id);
      if (unsentIds.length) {
        await tx.orderItemModifier.updateMany({ where: { orderItemId: { in: unsentIds } }, data: { deletedAt: new Date() } });
        await tx.orderItem.updateMany({ where: { id: { in: unsentIds } }, data: { deletedAt: new Date() } });
      }
      const priced = await this.priceLines(tx, order.outletId, incomingNew);
      for (const p of priced) await tx.orderItem.create({ data: { ...this.lineData(tid, p), orderId: id } });

      const allLines: PricedLine[] = [...sent.map((s) => ({ unitPrice: s.unitPrice, qty: s.qty, taxRateBps: s.taxRateBps })), ...priced];
      const totals = orderTotals(allLines, order.discount);
      await tx.order.update({ where: { id }, data: { subtotal: totals.subtotal, taxTotal: totals.taxTotal, total: totals.total } }); // version already bumped by claimVersion
      await this.audit.recordIn(tx, { action: 'order.items_replace', entity: 'orders', entityId: id, before, after: { ...totals, lines: sent.length + priced.length } });
      return this.get_(tx, id);
    });
  }

  // ---------- KOT ----------
  async createKot(orderId: string, d: S.CreateKot) {
    const tid = requireTenantId();
    return this.prisma.withTenant(tid, async (tx) => {
      const order = await this.mustOpen(tx, orderId);
      const unsent = await tx.orderItem.findMany({ where: { orderId, kotId: null, ...live }, include: { item: { select: { station: true } } } });
      const chosen = d.orderItemIds ? unsent.filter((u) => d.orderItemIds!.includes(u.id)) : unsent;
      if (d.orderItemIds && chosen.length !== new Set(d.orderItemIds).size) throw new UnprocessableEntityException('Some lines are unknown or already on a KOT');
      if (!chosen.length) throw new UnprocessableEntityException('No lines to send');
      const stations = new Set(chosen.map((c) => c.item.station).filter(Boolean));
      const station = d.station ?? (stations.size === 1 ? [...stations][0]! : null);
      const kotNo = await this.nextNo(tx, tid, order.outletId, 'kot', 'K');
      const kot = await tx.kot.create({ data: { tenantId: tid, orderId, outletId: order.outletId, kotNo, station } });
      await tx.orderItem.updateMany({ where: { id: { in: chosen.map((c) => c.id) } }, data: { kotId: kot.id } });
      return tx.kot.findUniqueOrThrow({ where: { id: kot.id }, include: { items: { where: live, include: { modifiers: { where: live } } } } });
    });
  }

  async setKotStatus(id: string, d: S.SetKotStatus) {
    const kot = await this.db.kot.findFirst({ where: { id, ...live } });
    if (!kot) throw new NotFoundException('KOT not found');
    if (kot.status === d.status) return kot;
    if (!KOT_TRANSITIONS[kot.status].includes(d.status)) throw new UnprocessableEntityException(`Cannot go from ${kot.status} to ${d.status}`);
    return this.db.kot.update({
      where: { id },
      data: { status: d.status, ...(d.status === 'READY' ? { readyAt: new Date() } : {}), ...(d.status === 'SERVED' ? { servedAt: new Date() } : {}) },
    });
  }

  // ---------- cancel ----------
  async cancel(id: string, d: S.CancelOrder) {
    const tid = requireTenantId();
    return this.prisma.withTenant(tid, async (tx) => {
      const order = await this.mustOpen(tx, id, d.version);
      await this.claimVersion(tx, id, d.version ?? order.version);
      await tx.order.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: d.reason } }); // version already bumped by claimVersion
      await tx.kot.updateMany({ where: { orderId: id, status: { in: ['PENDING', 'PREPARING', 'READY'] } }, data: { status: 'CANCELLED' } });
      if (order.tableId) {
        await tx.restaurantTable.updateMany({ where: { id: order.tableId, currentOrderId: id }, data: { status: 'FREE', statusSince: new Date(), currentOrderId: null, version: { increment: 1 } } });
      }
      await this.audit.recordIn(tx, { action: 'order.cancel', entity: 'orders', entityId: id, before: { status: order.status, total: order.total }, after: { status: 'CANCELLED' }, meta: { reason: d.reason } });
      return this.get_(tx, id);
    });
  }

  // ---------- helpers ----------
  /**
   * Optimistic-concurrency claim: atomically bump the version ONLY if it still equals `expected`.
   * Two concurrent writers with the same version -> exactly one matches a row; the other gets 409.
   * (A plain read-then-compare is not enough: both would read the same version and both would "win".)
   */
  private async claimVersion(tx: Tx, id: string, expected: number) {
    const c = await tx.order.updateMany({ where: { id, version: expected, status: 'OPEN', ...live }, data: { version: { increment: 1 } } });
    if (c.count === 0) throw new ConflictException({ message: 'Stale order version', expected });
  }

  private async mustOpen(tx: Tx, id: string, version?: number) {
    const o = await tx.order.findFirst({ where: { id, ...live } });
    if (!o) throw new NotFoundException('Order not found');
    if (o.status !== 'OPEN') throw new ConflictException(`Order is ${o.status}`);
    if (version !== undefined && version !== o.version) throw new ConflictException({ message: 'Stale order version', current: o.version });
    return o;
  }

  /** Re-price every incoming line from the catalogue for this outlet; validates variant + modifier selections. */
  private async priceLines(tx: Tx, outletId: string, lines: S.OrderLineInput[]): Promise<PricedInput[]> {
    const out: PricedInput[] = [];
    for (const l of lines) {
      const item = await tx.menuItem.findFirst({
        where: { id: l.itemId, ...live },
        include: {
          outletPrices: { where: { outletId, ...live } },
          variants: { where: live },
          modifierGroups: { where: live, include: { group: { include: { options: { where: live } } } } },
        },
      });
      if (!item) throw new NotFoundException(`Item ${l.itemId} not found`);
      const override = item.outletPrices[0];
      if (!(override?.isAvailable ?? item.isAvailable)) throw new UnprocessableEntityException(`${item.name} is not available`);
      let unitPrice = override?.price ?? item.basePrice;

      let variantName: string | null = null;
      if (l.variantId) {
        const v = item.variants.find((x) => x.id === l.variantId && x.isAvailable);
        if (!v) throw new UnprocessableEntityException(`Variant not valid for ${item.name}`);
        unitPrice += v.priceDelta;
        variantName = v.name;
      }

      const modifiers: PricedInput['modifiers'] = [];
      const chosen = new Set(l.modifierIds ?? []);
      for (const mg of item.modifierGroups) {
        const picked = mg.group.options.filter((o) => chosen.has(o.id));
        if (picked.length < mg.group.minSelect) throw new UnprocessableEntityException(`${item.name}: choose at least ${mg.group.minSelect} from ${mg.group.name}`);
        if (picked.length > mg.group.maxSelect) throw new UnprocessableEntityException(`${item.name}: at most ${mg.group.maxSelect} from ${mg.group.name}`);
        for (const o of picked) {
          if (!o.isAvailable) throw new UnprocessableEntityException(`${o.name} is not available`);
          modifiers.push({ optionId: o.id, name: o.name, price: o.price });
          unitPrice += o.price;
          chosen.delete(o.id);
        }
      }
      if (chosen.size) throw new UnprocessableEntityException(`Modifier(s) not valid for ${item.name}`);

      out.push({
        itemId: item.id,
        name: item.name,
        variantId: l.variantId ?? null,
        variantName,
        notes: l.notes ?? null,
        clientLineId: l.clientLineId ?? null,
        modifiers,
        unitPrice,
        qty: l.qty,
        taxRateBps: item.taxRateBps,
      });
    }
    return out;
  }

  private lineData(tid: string, p: PricedInput) {
    return {
      tenantId: tid,
      itemId: p.itemId,
      name: p.name,
      variantId: p.variantId,
      variantName: p.variantName,
      clientLineId: p.clientLineId,
      qty: p.qty,
      unitPrice: p.unitPrice,
      taxRateBps: p.taxRateBps,
      lineTotal: p.unitPrice * p.qty,
      notes: p.notes,
      modifiers: p.modifiers.length ? { create: p.modifiers.map((m) => ({ ...m, tenantId: tid })) } : undefined,
    };
  }

  /** Per-outlet counter under row lock (UPDATE ... RETURNING). */
  private async nextNo(tx: Tx, tid: string, outletId: string, key: string, prefix = ''): Promise<string> {
    await tx.$executeRaw`INSERT INTO sequences (id, tenant_id, outlet_id, key, value, created_at, updated_at)
      VALUES (gen_random_uuid(), ${tid}::uuid, ${outletId}::uuid, ${key}, 0, now(), now()) ON CONFLICT (outlet_id, key) DO NOTHING`;
    const rows = await tx.$queryRaw<{ value: number }[]>`UPDATE sequences SET value = value + 1, updated_at = now() WHERE outlet_id = ${outletId}::uuid AND key = ${key} RETURNING value`;
    return `${prefix}${String(rows[0].value).padStart(6, '0')}`;
  }

  private async get_(tx: Tx, id: string) {
    return this.shape(await tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude }));
  }
  private shape(o: Prisma.OrderGetPayload<{ include: typeof orderInclude }>) {
    return { ...o, kots: o.kots.map((k) => ({ ...k, itemIds: k.items.map((i) => i.id), items: undefined })) };
  }
}
