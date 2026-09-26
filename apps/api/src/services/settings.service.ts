import { PrismaService } from '../database/client';
import { requireTenantId } from '../context/tenant-context';
import type * as S from '../schemas/settings.schemas';

const select = { id: true, name: true, gstin: true, currency: true, timezone: true, slug: true } as const;

/** Business profile (Settings, T-109) — the tenant row itself. currency/timezone are read-only here (set at seed time). */
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}
  private get db() {
    return this.prisma.scoped;
  }

  get() {
    return this.db.tenant.findFirstOrThrow({ where: { id: requireTenantId() }, select });
  }
  update(d: S.UpdateSettings) {
    return this.db.tenant.update({ where: { id: requireTenantId() }, data: d, select });
  }
}
