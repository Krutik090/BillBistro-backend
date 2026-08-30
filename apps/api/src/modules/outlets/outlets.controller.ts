import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/decorators';
import { PrismaService } from '../../prisma/prisma.service';

const select = { id: true, code: true, name: true, address: true, phone: true, isActive: true } as const;

/** Outlet discovery for POS/dashboard (tenant-scoped by RLS). Full outlet CRUD lands with tenant admin (Phase 2). */
@ApiTags('outlets')
@Controller('outlets')
export class OutletsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('outlets.read')
  list(@Query('includeInactive') inc?: string) {
    return this.prisma.scoped.outlet.findMany({
      where: { deletedAt: null, ...(inc === 'true' ? {} : { isActive: true }) },
      orderBy: { code: 'asc' },
      select,
    });
  }

  @Get(':id')
  @RequirePermissions('outlets.read')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const o = await this.prisma.scoped.outlet.findFirst({ where: { id, deletedAt: null }, select });
    if (!o) throw new NotFoundException('Outlet not found');
    return o;
  }
}
