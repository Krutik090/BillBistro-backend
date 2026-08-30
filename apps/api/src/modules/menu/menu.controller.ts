import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermissions } from '../../auth/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { requireTenantId } from '../../tenancy/tenant-context';

const CreateCategory = z.object({ name: z.string().min(1), sortOrder: z.number().int().optional() });
const CreateItem = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  basePrice: z.number().int().nonnegative(), // paise
  taxRateBps: z.number().int().min(0).max(10000).optional(),
  isVeg: z.boolean().optional(),
  sku: z.string().optional(),
});

/** CRUD stubs — tenant scope is applied by prisma.scoped (RLS); no where:{tenantId} needed for reads. */
@ApiTags('menu')
@Controller('menu')
export class MenuController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('categories')
  @RequirePermissions('menu.read')
  categories() {
    return this.prisma.scoped.menuCategory.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } });
  }

  @Post('categories')
  @RequirePermissions('menu.write')
  createCategory(@Body(new ZodValidationPipe(CreateCategory)) body: z.infer<typeof CreateCategory>) {
    return this.prisma.scoped.menuCategory.create({ data: { ...body, tenantId: requireTenantId() } });
  }

  @Get('items')
  @RequirePermissions('menu.read')
  items() {
    return this.prisma.scoped.menuItem.findMany({ where: { deletedAt: null }, include: { variants: true, modifiers: true } });
  }

  @Get('items/:id')
  @RequirePermissions('menu.read')
  item(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.scoped.menuItem.findFirstOrThrow({ where: { id, deletedAt: null } });
  }

  @Post('items')
  @RequirePermissions('menu.write')
  createItem(@Body(new ZodValidationPipe(CreateItem)) body: z.infer<typeof CreateItem>) {
    return this.prisma.scoped.menuItem.create({ data: { ...body, tenantId: requireTenantId() } });
  }
}
