import { NotFoundException } from '../../common/errors';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { requireTenantId } from '../../tenancy/tenant-context';
import * as S from './menu.schemas';

const live = { deletedAt: null } as const;

/** Is the schedule open at `at` (outlet-local wall clock supplied by caller)? */
export function scheduleOpen(s: { daysMask: number; startMinute: number; endMinute: number } | null | undefined, at: Date): boolean {
  if (!s) return true;
  const day = at.getDay(); // 0=Sun
  if (!(s.daysMask & (1 << day))) return false;
  const m = at.getHours() * 60 + at.getMinutes();
  return m >= s.startMinute && m < s.endMinute;
}

export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.scoped;
  }
  private tid() {
    return requireTenantId();
  }

  // ---------- schedules ----------
  listSchedules() {
    return this.db.menuSchedule.findMany({ where: live, orderBy: { name: 'asc' } });
  }
  createSchedule(d: S.CreateSchedule) {
    return this.db.menuSchedule.create({ data: { ...d, tenantId: this.tid() } });
  }
  async updateSchedule(id: string, d: S.UpdateSchedule) {
    await this.mustExist('menuSchedule', id);
    return this.db.menuSchedule.update({ where: { id }, data: d });
  }
  softDeleteSchedule(id: string) {
    return this.softDelete('menuSchedule', id);
  }

  // ---------- categories ----------
  listCategories(includeInactive = false) {
    return this.db.menuCategory.findMany({
      where: { ...live, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { schedule: true },
    });
  }
  createCategory(d: S.CreateCategory) {
    return this.db.menuCategory.create({ data: { ...d, tenantId: this.tid() } });
  }
  async updateCategory(id: string, d: S.UpdateCategory) {
    await this.mustExist('menuCategory', id);
    return this.db.menuCategory.update({ where: { id }, data: d });
  }
  softDeleteCategory(id: string) {
    return this.softDelete('menuCategory', id);
  }

  // ---------- items ----------
  async listItems(q: S.ListItemsQuery) {
    const items = await this.db.menuItem.findMany({
      where: {
        ...live,
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
        ...(q.includeUnavailable ? {} : { isAvailable: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: this.itemInclude(q.outletId),
    });
    return items.map((i) => this.resolveItem(i, q.outletId));
  }
  async getItem(id: string, outletId?: string) {
    const i = await this.db.menuItem.findFirst({ where: { id, ...live }, include: this.itemInclude(outletId) });
    if (!i) throw new NotFoundException('Item not found');
    return this.resolveItem(i, outletId);
  }
  /** Nested create: item + variants + attached modifier groups (+ inline "Add-ons" group) in one transaction. */
  async createItem(d: S.CreateItem) {
    await this.mustExist('menuCategory', d.categoryId);
    const tid = this.tid();
    const { variants, modifierGroupIds, modifiers, ...item } = d;
    return this.prisma.withTenant(tid, async (tx) => {
      const groupIds = [...(modifierGroupIds ?? [])];
      if (groupIds.length) {
        const found = await tx.modifierGroup.count({ where: { id: { in: groupIds }, ...live } });
        if (found !== new Set(groupIds).size) throw new NotFoundException('One or more modifier groups not found');
      }
      const created = await tx.menuItem.create({
        data: {
          ...item,
          tenantId: tid,
          variants: variants?.length ? { create: variants.map((v, i) => ({ ...v, sortOrder: v.sortOrder ?? i, tenantId: tid })) } : undefined,
        },
      });
      if (modifiers?.length) {
        const g = await tx.modifierGroup.create({
          data: { tenantId: tid, name: `${created.name} add-ons`, minSelect: 0, maxSelect: modifiers.length, options: { create: modifiers.map((m, i) => ({ ...m, sortOrder: i, tenantId: tid })) } },
        });
        groupIds.push(g.id);
      }
      if (groupIds.length) {
        await tx.menuItemModifierGroup.createMany({ data: groupIds.map((groupId, i) => ({ tenantId: tid, itemId: created.id, groupId, sortOrder: i })) });
      }
      const full = await tx.menuItem.findUniqueOrThrow({ where: { id: created.id }, include: this.itemInclude() });
      return this.resolveItem(full);
    });
  }
  async updateItem(id: string, d: S.UpdateItem) {
    const before = await this.mustExist('menuItem', id);
    if (d.categoryId) await this.mustExist('menuCategory', d.categoryId);
    return this.prisma.withTenant(this.tid(), async (tx) => {
      const after = await tx.menuItem.update({ where: { id }, data: d });
      if (d.basePrice !== undefined && d.basePrice !== before.basePrice) {
        await this.audit.recordIn(tx, {
          action: 'menu.item.price_change',
          entity: 'menu_items',
          entityId: id,
          before: { basePrice: before.basePrice },
          after: { basePrice: after.basePrice },
        });
      }
      return after;
    });
  }
  softDeleteItem(id: string) {
    return this.softDelete('menuItem', id);
  }

  // ---------- variants ----------
  async createVariant(itemId: string, d: S.CreateVariant) {
    await this.mustExist('menuItem', itemId);
    return this.db.menuVariant.create({ data: { ...d, itemId, tenantId: this.tid() } });
  }
  async updateVariant(id: string, d: S.UpdateVariant) {
    await this.mustExist('menuVariant', id);
    return this.db.menuVariant.update({ where: { id }, data: d });
  }
  softDeleteVariant(id: string) {
    return this.softDelete('menuVariant', id);
  }

  // ---------- modifier groups / options ----------
  listModifierGroups() {
    return this.db.modifierGroup.findMany({ where: live, orderBy: { name: 'asc' }, include: { options: { where: live, orderBy: { sortOrder: 'asc' } } } });
  }
  createModifierGroup(d: S.CreateModifierGroup) {
    return this.db.modifierGroup.create({ data: { ...d, tenantId: this.tid() } });
  }
  async updateModifierGroup(id: string, d: S.UpdateModifierGroup) {
    await this.mustExist('modifierGroup', id);
    return this.db.modifierGroup.update({ where: { id }, data: d });
  }
  softDeleteModifierGroup(id: string) {
    return this.softDelete('modifierGroup', id);
  }
  async createModifierOption(groupId: string, d: S.CreateModifierOption) {
    await this.mustExist('modifierGroup', groupId);
    return this.db.modifierOption.create({ data: { ...d, groupId, tenantId: this.tid() } });
  }
  async updateModifierOption(id: string, d: S.UpdateModifierOption) {
    await this.mustExist('modifierOption', id);
    return this.db.modifierOption.update({ where: { id }, data: d });
  }
  softDeleteModifierOption(id: string) {
    return this.softDelete('modifierOption', id);
  }
  /** Replace the item's modifier groups (ordered). */
  async setItemModifierGroups(itemId: string, groupIds: string[]) {
    await this.mustExist('menuItem', itemId);
    const tid = this.tid();
    return this.prisma.withTenant(tid, async (tx) => {
      const found = await tx.modifierGroup.count({ where: { id: { in: groupIds }, ...live } });
      if (found !== new Set(groupIds).size) throw new NotFoundException('One or more modifier groups not found');
      await tx.menuItemModifierGroup.deleteMany({ where: { itemId } });
      if (groupIds.length) {
        await tx.menuItemModifierGroup.createMany({ data: groupIds.map((groupId, i) => ({ tenantId: tid, itemId, groupId, sortOrder: i })) });
      }
      return tx.menuItemModifierGroup.findMany({ where: { itemId }, orderBy: { sortOrder: 'asc' }, include: { group: { include: { options: { where: live } } } } });
    });
  }

  // ---------- per-outlet pricing ----------
  listOutletPrices(itemId: string) {
    return this.db.itemOutletPrice.findMany({ where: { itemId, ...live }, include: { outlet: { select: { id: true, code: true, name: true } } } });
  }
  async upsertOutletPrices(itemId: string, prices: S.UpsertOutletPrices['prices']) {
    await this.mustExist('menuItem', itemId);
    const tid = this.tid();
    return this.prisma.withTenant(tid, async (tx) => {
      const out = [];
      for (const p of prices) {
        const outlet = await tx.outlet.findFirst({ where: { id: p.outletId, ...live } });
        if (!outlet) throw new NotFoundException(`Outlet ${p.outletId} not found`);
        const before = await tx.itemOutletPrice.findUnique({ where: { itemId_outletId: { itemId, outletId: p.outletId } } });
        const row = await tx.itemOutletPrice.upsert({
          where: { itemId_outletId: { itemId, outletId: p.outletId } },
          create: { tenantId: tid, itemId, outletId: p.outletId, price: p.price ?? null, isAvailable: p.isAvailable ?? null },
          update: { ...(p.price !== undefined ? { price: p.price } : {}), ...(p.isAvailable !== undefined ? { isAvailable: p.isAvailable } : {}), deletedAt: null },
        });
        if (p.price !== undefined && before?.price !== row.price) {
          await this.audit.recordIn(tx, {
            action: 'menu.item.outlet_price_change',
            entity: 'item_outlet_prices',
            entityId: row.id,
            before: { price: before?.price ?? null },
            after: { price: row.price },
            meta: { itemId, outletId: p.outletId },
          });
        }
        out.push(row);
      }
      return out;
    });
  }

  // ---------- combos ----------
  listCombos(includeUnavailable = false) {
    return this.db.combo.findMany({
      where: { ...live, ...(includeUnavailable ? {} : { isAvailable: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { items: { where: live, include: { item: { select: { id: true, name: true } }, variant: { select: { id: true, name: true } } } } },
    });
  }
  async createCombo(d: S.CreateCombo) {
    const tid = this.tid();
    return this.prisma.withTenant(tid, async (tx) => {
      await this.assertComboItems(tx, d.items);
      const { items, ...rest } = d;
      return tx.combo.create({
        data: { ...rest, tenantId: tid, items: { create: items.map((ci) => ({ ...ci, tenantId: tid })) } },
        include: { items: true },
      });
    });
  }
  async updateCombo(id: string, d: S.UpdateCombo) {
    const before = await this.mustExist('combo', id);
    const tid = this.tid();
    return this.prisma.withTenant(tid, async (tx) => {
      const { items, ...rest } = d;
      if (items) {
        await this.assertComboItems(tx, items);
        await tx.comboItem.deleteMany({ where: { comboId: id } });
        await tx.comboItem.createMany({ data: items.map((ci) => ({ ...ci, comboId: id, tenantId: tid })) });
      }
      const after = await tx.combo.update({ where: { id }, data: rest, include: { items: true } });
      if (d.price !== undefined && d.price !== before.price) {
        await this.audit.recordIn(tx, { action: 'menu.combo.price_change', entity: 'combos', entityId: id, before: { price: before.price }, after: { price: after.price } });
      }
      return after;
    });
  }
  softDeleteCombo(id: string) {
    return this.softDelete('combo', id);
  }

  // ---------- effective menu for an outlet (what POS / QR / ordering consume) ----------
  async effectiveMenu(outletId: string, at = new Date()) {
    const outlet = await this.db.outlet.findFirst({ where: { id: outletId, ...live } });
    if (!outlet) throw new NotFoundException('Outlet not found');
    const [categories, combos] = await Promise.all([
      this.db.menuCategory.findMany({
        where: { ...live, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { schedule: true, items: { where: live, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: this.itemInclude(outletId) } },
      }),
      this.listCombos(),
    ]);
    return {
      outlet: { id: outlet.id, code: outlet.code, name: outlet.name },
      generatedAt: at.toISOString(),
      categories: categories
        .filter((c) => scheduleOpen(c.schedule, at))
        .map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          imageUrl: c.imageUrl,
          items: c.items.map((i) => this.resolveItem(i, outletId, at)).filter((i) => i.isAvailable),
        }))
        .filter((c) => c.items.length > 0),
      combos,
    };
  }

  // ---------- helpers ----------
  private itemInclude(outletId?: string) {
    return {
      schedule: true,
      variants: { where: live, orderBy: { sortOrder: 'asc' as const } },
      modifierGroups: { where: live, orderBy: { sortOrder: 'asc' as const }, include: { group: { include: { options: { where: live, orderBy: { sortOrder: 'asc' as const } } } } } },
      outletPrices: outletId ? { where: { outletId, ...live } } : false,
    } satisfies Prisma.MenuItemInclude;
  }

  /** Apply outlet override + schedule → effectivePrice / isAvailable; flatten modifier groups. */
  private resolveItem(i: Prisma.MenuItemGetPayload<{ include: ReturnType<MenuService['itemInclude']> }>, outletId?: string, at = new Date()) {
    const override = outletId ? (i.outletPrices as Array<{ price: number | null; isAvailable: boolean | null }> | undefined)?.[0] : undefined;
    const effectivePrice = override?.price ?? i.basePrice;
    const isAvailable = (override?.isAvailable ?? i.isAvailable) && scheduleOpen(i.schedule, at);
    const { outletPrices: _op, modifierGroups, schedule: _s, ...rest } = i;
    return {
      ...rest,
      effectivePrice,
      isAvailable,
      outletOverride: override ?? null,
      modifierGroups: modifierGroups.map((mg) => ({ id: mg.group.id, name: mg.group.name, minSelect: mg.group.minSelect, maxSelect: mg.group.maxSelect, options: mg.group.options })),
    };
  }

  private async assertComboItems(tx: Prisma.TransactionClient, items: Array<{ itemId: string; variantId?: string }>) {
    for (const ci of items) {
      const it = await tx.menuItem.findFirst({ where: { id: ci.itemId, ...live } });
      if (!it) throw new NotFoundException(`Item ${ci.itemId} not found`);
      if (ci.variantId) {
        const v = await tx.menuVariant.findFirst({ where: { id: ci.variantId, itemId: ci.itemId, ...live } });
        if (!v) throw new NotFoundException(`Variant ${ci.variantId} not found on item ${ci.itemId}`);
      }
    }
  }

  private async mustExist(model: 'menuSchedule' | 'menuCategory' | 'menuItem' | 'menuVariant' | 'modifierGroup' | 'modifierOption' | 'combo', id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (this.db as any)[model].findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException(`${model} ${id} not found`);
    return row;
  }
  private async softDelete(model: Parameters<MenuService['mustExist']>[0], id: string) {
    await this.mustExist(model, id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.db as any)[model].update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }
}
