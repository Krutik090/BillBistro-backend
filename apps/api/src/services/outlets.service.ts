import { NotFoundException } from '../utils/errors';
import { PrismaService } from '../database/client';
import type * as S from '../schemas/outlets.schemas';

const select = { id: true, code: true, name: true, address: true, phone: true, isActive: true } as const;

/** Outlet discovery for POS/dashboard (tenant-scoped by RLS), plus basic profile editing (Settings, T-109). */
export class OutletsService {
  constructor(private readonly prisma: PrismaService) {}
  private get db() {
    return this.prisma.scoped;
  }

  list(includeInactive: boolean) {
    return this.db.outlet.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { code: 'asc' },
      select,
    });
  }

  async get(id: string) {
    const o = await this.db.outlet.findFirst({ where: { id, deletedAt: null }, select });
    if (!o) throw new NotFoundException('Outlet not found');
    return o;
  }

  async update(id: string, d: S.UpdateOutlet) {
    await this.get(id);
    return this.db.outlet.update({ where: { id }, data: d, select });
  }
}
