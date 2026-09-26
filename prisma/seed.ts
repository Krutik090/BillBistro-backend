/* Seeds: permission catalogue, one tenant ("demo"), system roles, owner user, one outlet.
 * Runs with the owner connection (DATABASE_URL_MIGRATE) under app.bypass_rls=on. Idempotent. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { PERMISSIONS, ROLE_PERMISSIONS as ROLES } from '../apps/api/src/config/roles';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_MIGRATE } } });

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

    // ----- sample menu (idempotent by sku / name) -----
    const cat = async (name: string, sortOrder: number, scheduleId?: string) =>
      (await tx.menuCategory.findFirst({ where: { tenantId: tid, name, deletedAt: null } })) ??
      tx.menuCategory.create({ data: { tenantId: tid, name, sortOrder, scheduleId } });
    const breakfast =
      (await tx.menuSchedule.findFirst({ where: { tenantId: tid, name: 'Breakfast' } })) ??
      (await tx.menuSchedule.create({ data: { tenantId: tid, name: 'Breakfast', daysMask: 127, startMinute: 7 * 60, endMinute: 11 * 60 } }));
    const cStarters = await cat('Starters', 1);
    const cMains = await cat('Mains', 2);
    const cBreakfast = await cat('Breakfast', 0, breakfast.id);
    const item = (sku: string, data: { categoryId: string; name: string; basePrice: number; taxRateBps?: number; isVeg?: boolean; station?: string }) =>
      tx.menuItem.upsert({ where: { tenantId_sku: { tenantId: tid, sku } }, update: {}, create: { tenantId: tid, sku, ...data } });
    const paneer = await item('ST-001', { categoryId: cStarters.id, name: 'Paneer Tikka', basePrice: 24000, station: 'tandoor' });
    const dal = await item('MN-001', { categoryId: cMains.id, name: 'Dal Makhani', basePrice: 22000, station: 'curry' });
    const naan = await item('MN-002', { categoryId: cMains.id, name: 'Butter Naan', basePrice: 6000, station: 'tandoor' });
    await item('BF-001', { categoryId: cBreakfast.id, name: 'Masala Dosa', basePrice: 12000, station: 'dosa' });
    if (!(await tx.menuVariant.findFirst({ where: { itemId: dal.id } }))) {
      await tx.menuVariant.createMany({
        data: [
          { tenantId: tid, itemId: dal.id, name: 'Half', priceDelta: -8000, sortOrder: 0 },
          { tenantId: tid, itemId: dal.id, name: 'Full', priceDelta: 0, isDefault: true, sortOrder: 1 },
        ],
      });
    }
    const spice =
      (await tx.modifierGroup.findFirst({ where: { tenantId: tid, name: 'Spice level' } })) ??
      (await tx.modifierGroup.create({
        data: {
          tenantId: tid, name: 'Spice level', minSelect: 1, maxSelect: 1,
          options: { create: [{ tenantId: tid, name: 'Mild', isDefault: true, sortOrder: 0 }, { tenantId: tid, name: 'Medium', sortOrder: 1 }, { tenantId: tid, name: 'Hot', sortOrder: 2 }] },
        },
      }));
    const extras =
      (await tx.modifierGroup.findFirst({ where: { tenantId: tid, name: 'Extras' } })) ??
      (await tx.modifierGroup.create({
        data: { tenantId: tid, name: 'Extras', minSelect: 0, maxSelect: 3, options: { create: [{ tenantId: tid, name: 'Extra cheese', price: 3000 }, { tenantId: tid, name: 'Extra butter', price: 1500 }] } },
      }));
    for (const [itemId, groupId, sortOrder] of [[paneer.id, spice.id, 0], [dal.id, spice.id, 0], [dal.id, extras.id, 1]] as const) {
      await tx.menuItemModifierGroup.upsert({ where: { itemId_groupId: { itemId, groupId } }, update: {}, create: { tenantId: tid, itemId, groupId, sortOrder } });
    }
    await tx.itemOutletPrice.upsert({
      where: { itemId_outletId: { itemId: naan.id, outletId: outlet.id } },
      update: {},
      create: { tenantId: tid, itemId: naan.id, outletId: outlet.id, price: 6500 },
    });
    if (!(await tx.combo.findFirst({ where: { tenantId: tid, name: 'Dal + 2 Naan' } }))) {
      await tx.combo.create({
        data: { tenantId: tid, name: 'Dal + 2 Naan', price: 30000, items: { create: [{ tenantId: tid, itemId: dal.id, qty: 1 }, { tenantId: tid, itemId: naan.id, qty: 2 }] } },
      });
    }

    // ----- floor: sections + tables -----
    const sec = async (name: string, sortOrder: number) =>
      tx.floorSection.upsert({ where: { outletId_name: { outletId: outlet.id, name } }, update: {}, create: { tenantId: tid, outletId: outlet.id, name, sortOrder } });
    const ground = await sec('Ground floor', 0);
    const terrace = await sec('Terrace', 1);
    const tbl = (sectionId: string, code: string, capacity: number, posX: number, posY: number, sortOrder: number) =>
      tx.restaurantTable.upsert({ where: { outletId_code: { outletId: outlet.id, code } }, update: {}, create: { tenantId: tid, outletId: outlet.id, sectionId, code, capacity, posX, posY, sortOrder } });
    await Promise.all([
      tbl(ground.id, 'T1', 2, 100, 100, 0), tbl(ground.id, 'T2', 4, 300, 100, 1), tbl(ground.id, 'T3', 4, 500, 100, 2), tbl(ground.id, 'T4', 6, 100, 300, 3),
      tbl(terrace.id, 'R1', 4, 100, 100, 0), tbl(terrace.id, 'R2', 8, 400, 100, 1),
    ]);

    console.log(`seeded tenant=${slug} (${tid}) outlet=${outlet.code} owner=${email} / ${password} + sample menu + floor`);
  });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
