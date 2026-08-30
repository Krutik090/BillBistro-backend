import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { ZodSchema } from 'zod';
import { RequirePermissions } from '../../auth/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { FloorService } from './floor.service';
import * as S from './floor.schemas';

const Id = () => Param('id', ParseUUIDPipe);
const body = (s: ZodSchema) => Body(new ZodValidationPipe(s));
const query = (s: ZodSchema) => Query(new ZodValidationPipe(s));

/** Floor management: sections, tables, live occupancy. RBAC tables.read / tables.write. */
@ApiTags('floor')
@Controller('floor')
export class FloorController {
  constructor(private readonly floor: FloorService) {}

  @Get('outlets/:outletId') @RequirePermissions('tables.read') floorView(@Param('outletId', ParseUUIDPipe) outletId: string) { return this.floor.floor(outletId); }

  @Get('sections') @RequirePermissions('tables.read') listSections(@query(S.OutletQuery) q: S.OutletQuery) { return this.floor.listSections(q); }
  @Post('sections') @RequirePermissions('tables.write') createSection(@body(S.CreateSection) d: S.CreateSection) { return this.floor.createSection(d); }
  @Patch('sections/:id') @RequirePermissions('tables.write') updateSection(@Id() id: string, @body(S.UpdateSection) d: S.UpdateSection) { return this.floor.updateSection(id, d); }
  @Delete('sections/:id') @RequirePermissions('tables.write') deleteSection(@Id() id: string) { return this.floor.deleteSection(id); }

  @Get('tables') @RequirePermissions('tables.read') listTables(@query(S.ListTablesQuery) q: S.ListTablesQuery) { return this.floor.listTables(q); }
  @Get('tables/:id') @RequirePermissions('tables.read') getTable(@Id() id: string) { return this.floor.getTable(id); }
  @Post('tables') @RequirePermissions('tables.write') createTable(@body(S.CreateTable) d: S.CreateTable) { return this.floor.createTable(d); }
  @Patch('tables/:id') @RequirePermissions('tables.write') updateTable(@Id() id: string, @body(S.UpdateTable) d: S.UpdateTable) { return this.floor.updateTable(id, d); }
  @Delete('tables/:id') @RequirePermissions('tables.write') deleteTable(@Id() id: string) { return this.floor.deleteTable(id); }
  @Post('tables/:id/status') @RequirePermissions('tables.write') setStatus(@Id() id: string, @body(S.SetTableStatus) d: S.SetTableStatus) { return this.floor.setStatus(id, d); }
}
