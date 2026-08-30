import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { requireTenantId } from '../tenancy/tenant-context';

/**
 * Wraps every model operation in a short batch transaction that first sets the transaction-local
 * GUC `app.tenant_id` from the request context, so Postgres RLS filters the query.
 */
function createTenantClient(base: PrismaClient) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const tenantId = requireTenantId();
          const [, result] = await base.$transaction([
            base.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}
export type TenantClient = ReturnType<typeof createTenantClient>;

/**
 * Prisma access with tenant scoping enforced by Postgres RLS.
 *
 *  - `prisma.tenant`               : tenant-scoped client; tenant comes from AsyncLocalStorage per call.
 *  - `prisma.withTenant(tid, fn)`  : interactive transaction pre-bound to a tenant (multi-step writes).
 *  - `prisma.system(fn)`           : interactive transaction with `app.bypass_rls=on` — ONLY for platform
 *                                    paths that run before a tenant is known (login tenant lookup).
 *
 * The connection role (billbistro_app) has no BYPASSRLS, so a forgotten scope yields zero rows,
 * never another tenant's rows.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  readonly tenant: TenantClient = createTenantClient(this);

  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }

  withTenant<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`;
      return fn(tx);
    });
  }

  system<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return fn(tx);
    });
  }
}
