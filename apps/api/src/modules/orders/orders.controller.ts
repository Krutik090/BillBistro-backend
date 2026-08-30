import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, RequirePermissions } from '../../auth/decorators';
import type { AuthPrincipal } from '../../auth/auth.types';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

const CreateOrder = z.object({
  outletId: z.string().uuid(),
  type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']).default('DINE_IN'),
  tableRef: z.string().optional(),
  clientKey: z.string().min(8).optional(), // idempotency key from POS
});

/** Order CRUD stub. Business logic (pricing, KOT, billing) lands in Phase 1. */
@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('orders.read')
  list() {
    return this.prisma.scoped.order.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Get(':id')
  @RequirePermissions('orders.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.scoped.order.findFirstOrThrow({ where: { id, deletedAt: null }, include: { items: true, kots: true, bills: true } });
  }

  @Post()
  @RequirePermissions('orders.write')
  async create(@Body(new ZodValidationPipe(CreateOrder)) body: z.infer<typeof CreateOrder>, @CurrentUser() user: AuthPrincipal) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      if (body.clientKey) {
        const existing = await tx.order.findFirst({ where: { clientKey: body.clientKey } });
        if (existing) return existing; // idempotent replay
      }
      const count = await tx.order.count({ where: { outletId: body.outletId } });
      return tx.order.create({
        data: { ...body, tenantId: user.tenantId, createdById: user.userId, orderNo: String(count + 1).padStart(6, '0') },
      });
    });
  }
}
