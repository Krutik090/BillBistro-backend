import { ConflictException, NotFoundException, UnprocessableEntityException } from '../utils/errors';
import { Prisma } from '@prisma/client';
import { AuditService } from './audit.service';
import { PrismaService } from '../database/client';
import { currentContext, requireTenantId } from '../context/tenant-context';
import * as S from '../schemas/inventory.schemas';

const live = { deletedAt: null } as const;
type Tx = Prisma.TransactionClient;

/**
 * Basic inventory (Phase 3, T-107): stock levels + a manual ledger + recipe-based auto-deduction
 * when a KOT is sent. Quantities are integer milli-units throughout (see schema.prisma comment).
 */
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  private get db() {
    return this.prisma.scoped;
  }

  // ---------- items ----------
  async list(q: S.ListInventoryQuery) {
    const items = await this.db.inventoryItem.findMany({
      where: { ...live, ...(q.includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });
    // stockMilli <= lowStockMilli compares two columns on the same row — simplest done in JS at this scale.
    return q.lowStockOnly ? items.filter((i) => i.stockMilli <= i.lowStockMilli) : items;
  }
  async get(id: string) {
    const i = await this.db.inventoryItem.findFirst({ where: { id, ...live } });
    if (!i) throw new NotFoundException('Inventory item not found');
    return i;
  }
  async create(d: S.CreateInventoryItem) {
    const tid = requireTenantId();
    const existing = await this.db.inventoryItem.findFirst({ where: { name: d.name, ...live } });
    if (existing) throw new ConflictException(`Inventory item '${d.name}' already exists`);
    return this.db.inventoryItem.create({ data: { tenantId: tid, name: d.name, unit: d.unit, stockMilli: d.stockMilli ?? 0, lowStockMilli: d.lowStockMilli ?? 0 } });
  }
  async update(id: string, d: S.UpdateInventoryItem) {
    await this.get(id);
    return this.db.inventoryItem.update({ where: { id }, data: d });
  }

  // ---------- stock ledger ----------
  async adjust(id: string, d: S.AdjustStock) {
    const tid = requireTenantId();
    const userId = currentContext()?.userId ?? null;
    return this.prisma.withTenant(tid, async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { id, ...live } });
      if (!item) throw new NotFoundException('Inventory item not found');
      const balanceMilli = item.stockMilli + d.qtyMilli;
      await tx.inventoryItem.update({ where: { id }, data: { stockMilli: balanceMilli } });
      const movement = await tx.stockMovement.create({
        data: { tenantId: tid, inventoryItemId: id, type: d.qtyMilli > 0 ? 'RECEIVE' : 'ADJUST', qtyMilli: d.qtyMilli, balanceMilli, reason: d.reason, createdById: userId },
      });
      await this.audit.recordIn(tx, { action: 'inventory.adjust', entity: 'inventory_items', entityId: id, before: { stockMilli: item.stockMilli }, after: { stockMilli: balanceMilli, qtyMilli: d.qtyMilli, reason: d.reason } });
      return movement;
    });
  }
  movements(id: string, q: S.ListMovementsQuery) {
    return this.db.stockMovement.findMany({ where: { inventoryItemId: id }, orderBy: { createdAt: 'desc' }, take: q.limit });
  }

  // ---------- recipes ----------
  async recipe(menuItemId: string) {
    return this.db.recipeLine.findMany({ where: { menuItemId, ...live }, include: { inventoryItem: { select: { id: true, name: true, unit: true } } } });
  }
  /** Full replace: lines missing from the new set are removed, the rest upserted. */
  async setRecipe(menuItemId: string, d: S.SetRecipe) {
    const tid = requireTenantId();
    return this.prisma.withTenant(tid, async (tx) => {
      const item = await tx.menuItem.findFirst({ where: { id: menuItemId, ...live } });
      if (!item) throw new NotFoundException('Menu item not found');
      const invIds = d.lines.map((l) => l.inventoryItemId);
      const invItems = await tx.inventoryItem.findMany({ where: { id: { in: invIds }, ...live } });
      if (invItems.length !== new Set(invIds).size) throw new UnprocessableEntityException('One or more inventory items not found');

      await tx.recipeLine.deleteMany({ where: { menuItemId, inventoryItemId: { notIn: invIds } } });
      for (const l of d.lines) {
        await tx.recipeLine.upsert({
          where: { menuItemId_inventoryItemId: { menuItemId, inventoryItemId: l.inventoryItemId } },
          update: { qtyMilli: l.qtyMilli },
          create: { tenantId: tid, menuItemId, inventoryItemId: l.inventoryItemId, qtyMilli: l.qtyMilli },
        });
      }
      return this.recipe(menuItemId);
    });
  }
}

/**
 * Auto-deduction on KOT send (T-107). Framework-agnostic, called from OrdersService.createKot
 * inside the SAME transaction so a KOT and its stock deduction are atomic. Deliberately allows
 * stock to go negative rather than blocking the KOT — a kitchen running short mid-service must
 * still be able to fire the ticket; negative stock is the signal, not a hard stop (basic scope).
 */
export async function deductStockForKot(tx: Tx, tid: string, kotId: string, lines: { itemId: string; qty: number }[]): Promise<void> {
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const recipeLines = await tx.recipeLine.findMany({ where: { menuItemId: { in: itemIds }, ...live } });
  if (!recipeLines.length) return;

  const qtyByItem = new Map(lines.map((l) => [l.itemId, l.qty]));
  const deductByInventory = new Map<string, number>();
  for (const r of recipeLines) {
    const qty = qtyByItem.get(r.menuItemId) ?? 0;
    deductByInventory.set(r.inventoryItemId, (deductByInventory.get(r.inventoryItemId) ?? 0) + r.qtyMilli * qty);
  }

  for (const [inventoryItemId, amount] of deductByInventory) {
    if (amount <= 0) continue;
    const inv = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!inv) continue; // recipe pointed at a since-deleted inventory item — skip rather than fail the KOT
    const balanceMilli = inv.stockMilli - amount;
    await tx.inventoryItem.update({ where: { id: inventoryItemId }, data: { stockMilli: balanceMilli } });
    await tx.stockMovement.create({ data: { tenantId: tid, inventoryItemId, type: 'DEDUCT', qtyMilli: -amount, balanceMilli, kotId, reason: 'KOT sent' } });
  }
}
