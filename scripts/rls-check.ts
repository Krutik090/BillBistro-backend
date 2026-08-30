/* Proves RLS isolation end-to-end through the *app role*:
 *  1. tenant A cannot read tenant B rows
 *  2. no tenant context => no rows
 *  3. WITH CHECK rejects a row tagged with tenant B while scoped to A
 *  4. the app role has no BYPASSRLS
 * Fixture tenants are created with the owner connection under app.bypass_rls=on and removed after. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_MIGRATE } } });
const app = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

function fail(msg: string): never {
  console.error('RLS CHECK FAILED:', msg);
  process.exit(1);
}

async function main() {
  const A = crypto.randomUUID();
  const B = crypto.randomUUID();
  await admin.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    for (const [id, slug] of [[A, `rls-a-${A.slice(0, 8)}`], [B, `rls-b-${B.slice(0, 8)}`]]) {
      await tx.tenant.create({ data: { id, tenantId: id, slug, name: slug } });
      await tx.menuCategory.create({ data: { tenantId: id, name: `cat-${slug}` } });
    }
  });

  try {
    // 1. read as A via app role -> only A rows
    const seenAsA = await app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${A}, true)`;
      return tx.menuCategory.findMany({ where: { tenantId: { in: [A, B] } } });
    });
    if (seenAsA.some((c) => c.tenantId === B)) fail('tenant A can see tenant B rows');
    if (!seenAsA.some((c) => c.tenantId === A)) fail('tenant A cannot see its own rows');

    // 2. no tenant context -> nothing visible
    const seenNoCtx = await app.menuCategory.findMany({ where: { tenantId: { in: [A, B] } } });
    if (seenNoCtx.length !== 0) fail('rows visible without tenant context');

    // 3. cross-tenant write rejected by WITH CHECK
    let blocked = false;
    try {
      await app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${A}, true)`;
        await tx.menuCategory.create({ data: { tenantId: B, name: 'smuggled' } });
      });
    } catch {
      blocked = true;
    }
    if (!blocked) fail('tenant A could insert a row owned by tenant B');

    // 4. app role cannot bypass RLS at the role level
    const rls = await app.$queryRaw<{ rolbypassrls: boolean; rolsuper: boolean }[]>`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
    if (rls[0]?.rolbypassrls || rls[0]?.rolsuper) fail('app role is superuser or has BYPASSRLS');
  } finally {
    await admin.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      await tx.menuCategory.deleteMany({ where: { tenantId: { in: [A, B] } } });
      await tx.tenant.deleteMany({ where: { id: { in: [A, B] } } });
    });
  }
  console.log('RLS CHECK PASSED: cross-tenant read hidden; no-context read empty; cross-tenant write rejected; app role has no BYPASSRLS');
}

main()
  .catch((e) => fail(String(e)))
  .finally(async () => {
    await admin.$disconnect();
    await app.$disconnect();
  });
