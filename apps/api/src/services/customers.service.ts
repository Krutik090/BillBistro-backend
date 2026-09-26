import { ConflictException, NotFoundException } from '../utils/errors';
import { PrismaService } from '../database/client';
import { requireTenantId } from '../context/tenant-context';
import * as S from '../schemas/customers.schemas';

const live = { deletedAt: null } as const;

/** Basic CRM (T-109) — a phone book. No loyalty/points/order-linking yet (deliberately out of scope). */
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}
  private get db() {
    return this.prisma.scoped;
  }

  list(q: S.ListCustomersQuery) {
    return this.db.customer.findMany({
      where: { ...live, ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } : {}) },
      orderBy: { name: 'asc' },
      take: q.limit,
    });
  }
  async get(id: string) {
    const c = await this.db.customer.findFirst({ where: { id, ...live } });
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }
  async create(d: S.CreateCustomer) {
    const tid = requireTenantId();
    const existing = await this.db.customer.findFirst({ where: { phone: d.phone, ...live } });
    if (existing) throw new ConflictException(`A customer with phone ${d.phone} already exists`);
    return this.db.customer.create({ data: { tenantId: tid, name: d.name, phone: d.phone, email: d.email ?? null, notes: d.notes ?? null } });
  }
  async update(id: string, d: S.UpdateCustomer) {
    await this.get(id);
    if (d.phone) {
      const existing = await this.db.customer.findFirst({ where: { phone: d.phone, id: { not: id }, ...live } });
      if (existing) throw new ConflictException(`A customer with phone ${d.phone} already exists`);
    }
    return this.db.customer.update({ where: { id }, data: d });
  }
  async delete(id: string) {
    await this.get(id);
    await this.db.customer.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
