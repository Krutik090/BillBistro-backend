import { ConflictException, NotFoundException, UnprocessableEntityException } from '../utils/errors';
import { PrismaService } from '../database/client';
import { requireTenantId } from '../context/tenant-context';
import * as S from '../schemas/floor.schemas';

const live = { deletedAt: null } as const;

/** Legal occupancy transitions. Ordering (T-102) will drive FREE->OCCUPIED->BILLED->FREE itself. */
const TRANSITIONS: Record<S.TableStatus, S.TableStatus[]> = {
  FREE: ['OCCUPIED', 'RESERVED', 'BLOCKED', 'CLEANING'],
  RESERVED: ['OCCUPIED', 'FREE', 'BLOCKED'],
  OCCUPIED: ['BILLED', 'FREE', 'CLEANING'],
  BILLED: ['CLEANING', 'FREE'],
  CLEANING: ['FREE', 'BLOCKED'],
  BLOCKED: ['FREE'],
};

export class FloorService {
  constructor(private readonly prisma: PrismaService) {}
  private get db() {
    return this.prisma.scoped;
  }

  // ---------- sections ----------
  listSections(q: S.OutletQuery) {
    return this.db.floorSection.findMany({
      where: { outletId: q.outletId, ...live, ...(q.includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
  async createSection(d: S.CreateSection) {
    await this.mustOutlet(d.outletId);
    return this.db.floorSection.create({ data: { ...d, tenantId: requireTenantId() } });
  }
  async updateSection(id: string, d: S.UpdateSection) {
    await this.mustSection(id);
    return this.db.floorSection.update({ where: { id }, data: d });
  }
  async deleteSection(id: string) {
    await this.mustSection(id);
    const inUse = await this.db.restaurantTable.count({ where: { sectionId: id, ...live } });
    if (inUse) throw new UnprocessableEntityException(`Section still has ${inUse} table(s)`);
    await this.db.floorSection.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  // ---------- tables ----------
  listTables(q: S.ListTablesQuery) {
    return this.db.restaurantTable.findMany({
      where: {
        outletId: q.outletId,
        ...live,
        ...(q.sectionId ? { sectionId: q.sectionId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: { section: { select: { id: true, name: true } } },
    });
  }
  async getTable(id: string) {
    const t = await this.db.restaurantTable.findFirst({ where: { id, ...live }, include: { section: { select: { id: true, name: true } } } });
    if (!t) throw new NotFoundException('Table not found');
    return t;
  }
  async createTable(d: S.CreateTable) {
    await this.mustOutlet(d.outletId);
    const sec = await this.mustSection(d.sectionId);
    if (sec.outletId !== d.outletId) throw new UnprocessableEntityException('Section belongs to a different outlet');
    return this.db.restaurantTable.create({ data: { ...d, tenantId: requireTenantId() } });
  }
  async updateTable(id: string, d: S.UpdateTable) {
    const t = await this.getTable(id);
    if (d.sectionId) {
      const sec = await this.mustSection(d.sectionId);
      if (sec.outletId !== t.outletId) throw new UnprocessableEntityException('Section belongs to a different outlet');
    }
    return this.db.restaurantTable.update({ where: { id }, data: d });
  }
  async deleteTable(id: string) {
    const t = await this.getTable(id);
    if (t.status === 'OCCUPIED' || t.status === 'BILLED') throw new ConflictException(`Table is ${t.status}`);
    await this.db.restaurantTable.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  /** Occupancy transition with optional optimistic-concurrency check. */
  async setStatus(id: string, d: S.SetTableStatus) {
    const t = await this.getTable(id);
    if (d.version !== undefined && d.version !== t.version) throw new ConflictException({ message: 'Stale table version', current: t.version });
    if (t.status === d.status) return t;
    if (!TRANSITIONS[t.status].includes(d.status)) throw new UnprocessableEntityException(`Cannot go from ${t.status} to ${d.status}`);
    const r = await this.db.restaurantTable.updateMany({
      where: { id, version: t.version },
      data: { status: d.status, statusSince: new Date(), version: { increment: 1 }, ...(d.status === 'FREE' ? { currentOrderId: null } : {}) },
    });
    if (r.count === 0) throw new ConflictException('Concurrent update, retry');
    return this.getTable(id);
  }

  /** Whole floor for the POS: sections -> tables, plus occupancy counts. */
  async floor(outletId: string) {
    await this.mustOutlet(outletId);
    const sections = await this.db.floorSection.findMany({
      where: { outletId, ...live, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { tables: { where: { ...live, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] } },
    });
    const all = sections.flatMap((s) => s.tables);
    const counts = Object.fromEntries(S.TableStatus.options.map((st) => [st, all.filter((t) => t.status === st).length]));
    return { outletId, generatedAt: new Date().toISOString(), counts: { total: all.length, ...counts }, sections };
  }

  // ---------- helpers ----------
  private async mustOutlet(id: string) {
    const o = await this.db.outlet.findFirst({ where: { id, ...live } });
    if (!o) throw new NotFoundException('Outlet not found');
    return o;
  }
  private async mustSection(id: string) {
    const s = await this.db.floorSection.findFirst({ where: { id, ...live } });
    if (!s) throw new NotFoundException('Section not found');
    return s;
  }
}
