/* Seeds: permission catalogue, one tenant ("demo"), system roles, owner user, one outlet.
 * Runs with the owner connection (DATABASE_URL_MIGRATE) under app.bypass_rls=on. Idempotent. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_MIGRATE } } });

export const PERMISSIONS = [
  'tenant.manage', 'outlets.read', 'outlets.write', 'users.read', 'users.write', 'roles.manage',
  'menu.read', 'menu.write', 'orders.read', 'orders.write', 'kots.read', 'kots.write',
  'bills.read', 'bills.write', 'bills.void', 'payments.read', 'payments.write', 'reports.read',
];
const ROLES: Record<string, string[]> = {
  owner: PERMISSIONS,
  manager: PERMISSIONS.filter((p) => p !== 'tenant.manage'),
  cashier: ['menu.read', 'orders.read', 'orders.write', 'kots.read', 'bills.read', 'bills.write', 'payments.read', 'payments.write'],
  kitchen: ['kots.read', 'kots.write', 'orders.read'],
};

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;

    for (const key of PERMISSIONS) {
      await tx.permission.upsert({ where: { key }, update: {}, create: { key } });
    }
    const perms = await tx.permission.findMany();
    const permId = Object.fromEntries(perms.map((p) => [p.key, p.id]));

    const slug = process.env.SEED_TENANT_SLUG ?? 'demo';
    let tenant = await tx.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      // tenant_id is a self-reference; create with a pre-generated id
      const id = crypto.randomUUID();
      tenant = await tx.tenant.create({ data: { id, tenantId: id, slug, name: 'Demo Restaurant' } });
    }
    const tid = tenant.id;

    for (const [key, keys] of Object.entries(ROLES)) {
      const role = await tx.role.upsert({
        where: { tenantId_key: { tenantId: tid, key } },
        update: {},
        create: { tenantId: tid, key, name: key[0].toUpperCase() + key.slice(1), isSystem: true },
      });
      for (const pk of keys) {
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permId[pk] } },
          update: {},
          create: { tenantId: tid, roleId: role.id, permissionId: permId[pk] },
        });
      }
    }

    const outlet = await tx.outlet.upsert({
      where: { tenantId_code: { tenantId: tid, code: 'MAIN' } },
      update: {},
      create: { tenantId: tid, code: 'MAIN', name: 'Main Outlet', address: 'Ahmedabad, GJ' },
    });

    const email = process.env.SEED_OWNER_EMAIL ?? 'owner@demo.local';
    const password = process.env.SEED_OWNER_PASSWORD ?? 'Password123!';
    const user = await tx.user.upsert({
      where: { tenantId_email: { tenantId: tid, email } },
      update: {},
      create: { tenantId: tid, email, name: 'Demo Owner', passwordHash: await argon2.hash(password) },
    });
    const ownerRole = await tx.role.findUniqueOrThrow({ where: { tenantId_key: { tenantId: tid, key: 'owner' } } });
    const existing = await tx.userRole.findFirst({ where: { userId: user.id, roleId: ownerRole.id, outletId: null } });
    if (!existing) await tx.userRole.create({ data: { tenantId: tid, userId: user.id, roleId: ownerRole.id } });

    console.log(`seeded tenant=${slug} (${tid}) outlet=${outlet.code} owner=${email} / ${password}`);
  });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
