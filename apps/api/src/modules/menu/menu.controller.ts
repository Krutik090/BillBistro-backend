import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../auth/decorators';
import type { ZodSchema } from 'zod';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { MenuService } from './menu.service';
import * as S from './menu.schemas';

const Id = () => Param('id', ParseUUIDPipe);
const body = (s: ZodSchema) => Body(new ZodValidationPipe(s));

/**
 * Menu catalogue. Tenant scope = RLS via prisma.scoped; RBAC = menu.read / menu.write.
 * Money is integer paise; tax in basis points.
 */
@ApiTags('menu')
@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  // ----- effective menu for POS / QR -----
  @Get('outlets/:outletId/effective')
  @RequirePermissions('menu.read')
  effective(@Param('outletId', ParseUUIDPipe) outletId: string, @Query('at') at?: string) {
    return this.menu.effectiveMenu(outletId, at ? new Date(at) : new Date());
  }

  // ----- schedules -----
  @Get('schedules') @RequirePermissions('menu.read') listSchedules() { return this.menu.listSchedules(); }
  @Post('schedules') @RequirePermissions('menu.write') createSchedule(@body(S.CreateSchedule) d: S.CreateSchedule) { return this.menu.createSchedule(d); }
  @Patch('schedules/:id') @RequirePermissions('menu.write') updateSchedule(@Id() id: string, @body(S.UpdateSchedule) d: S.UpdateSchedule) { return this.menu.updateSchedule(id, d); }
  @Delete('schedules/:id') @RequirePermissions('menu.write') deleteSchedule(@Id() id: string) { return this.menu.softDeleteSchedule(id); }

  // ----- categories -----
  @Get('categories') @RequirePermissions('menu.read') listCategories(@Query('includeInactive') inc?: string) { return this.menu.listCategories(inc === 'true'); }
  @Post('categories') @RequirePermissions('menu.write') createCategory(@body(S.CreateCategory) d: S.CreateCategory) { return this.menu.createCategory(d); }
  @Patch('categories/:id') @RequirePermissions('menu.write') updateCategory(@Id() id: string, @body(S.UpdateCategory) d: S.UpdateCategory) { return this.menu.updateCategory(id, d); }
  @Delete('categories/:id') @RequirePermissions('menu.write') deleteCategory(@Id() id: string) { return this.menu.softDeleteCategory(id); }

  // ----- items -----
  @Get('items') @RequirePermissions('menu.read') listItems(@Query(new ZodValidationPipe(S.ListItemsQuery)) q: S.ListItemsQuery) { return this.menu.listItems(q); }
  @Get('items/:id') @RequirePermissions('menu.read') getItem(@Id() id: string, @Query('outletId') outletId?: string) { return this.menu.getItem(id, outletId); }
  @Post('items') @RequirePermissions('menu.write') createItem(@body(S.CreateItem) d: S.CreateItem) { return this.menu.createItem(d); }
  @Patch('items/:id') @RequirePermissions('menu.write') updateItem(@Id() id: string, @body(S.UpdateItem) d: S.UpdateItem) { return this.menu.updateItem(id, d); }
  @Delete('items/:id') @RequirePermissions('menu.write') deleteItem(@Id() id: string) { return this.menu.softDeleteItem(id); }

  // ----- variants -----
  @Post('items/:id/variants') @RequirePermissions('menu.write') createVariant(@Id() itemId: string, @body(S.CreateVariant) d: S.CreateVariant) { return this.menu.createVariant(itemId, d); }
  @Patch('variants/:id') @RequirePermissions('menu.write') updateVariant(@Id() id: string, @body(S.UpdateVariant) d: S.UpdateVariant) { return this.menu.updateVariant(id, d); }
  @Delete('variants/:id') @RequirePermissions('menu.write') deleteVariant(@Id() id: string) { return this.menu.softDeleteVariant(id); }

  // ----- modifier groups / options -----
  @Get('modifier-groups') @RequirePermissions('menu.read') listModifierGroups() { return this.menu.listModifierGroups(); }
  @Post('modifier-groups') @RequirePermissions('menu.write') createModifierGroup(@body(S.CreateModifierGroup) d: S.CreateModifierGroup) { return this.menu.createModifierGroup(d); }
  @Patch('modifier-groups/:id') @RequirePermissions('menu.write') updateModifierGroup(@Id() id: string, @body(S.UpdateModifierGroup) d: S.UpdateModifierGroup) { return this.menu.updateModifierGroup(id, d); }
  @Delete('modifier-groups/:id') @RequirePermissions('menu.write') deleteModifierGroup(@Id() id: string) { return this.menu.softDeleteModifierGroup(id); }
  @Post('modifier-groups/:id/options') @RequirePermissions('menu.write') createOption(@Id() groupId: string, @body(S.CreateModifierOption) d: S.CreateModifierOption) { return this.menu.createModifierOption(groupId, d); }
  @Patch('modifier-options/:id') @RequirePermissions('menu.write') updateOption(@Id() id: string, @body(S.UpdateModifierOption) d: S.UpdateModifierOption) { return this.menu.updateModifierOption(id, d); }
  @Delete('modifier-options/:id') @RequirePermissions('menu.write') deleteOption(@Id() id: string) { return this.menu.softDeleteModifierOption(id); }
  @Put('items/:id/modifier-groups') @RequirePermissions('menu.write') setItemGroups(@Id() itemId: string, @body(S.SetItemModifierGroups) d: S.SetItemModifierGroups) { return this.menu.setItemModifierGroups(itemId, d.groupIds); }

  // ----- per-outlet pricing / availability -----
  @Get('items/:id/pricing') @RequirePermissions('menu.read') listPricing(@Id() itemId: string) { return this.menu.listOutletPrices(itemId); }
  @Put('items/:id/pricing') @RequirePermissions('menu.write') upsertPricing(@Id() itemId: string, @body(S.UpsertOutletPrices) d: S.UpsertOutletPrices) { return this.menu.upsertOutletPrices(itemId, d.prices); }

  // ----- combos -----
  @Get('combos') @RequirePermissions('menu.read') listCombos(@Query('includeUnavailable') inc?: string) { return this.menu.listCombos(inc === 'true'); }
  @Post('combos') @RequirePermissions('menu.write') createCombo(@body(S.CreateCombo) d: S.CreateCombo) { return this.menu.createCombo(d); }
  @Patch('combos/:id') @RequirePermissions('menu.write') updateCombo(@Id() id: string, @body(S.UpdateCombo) d: S.UpdateCombo) { return this.menu.updateCombo(id, d); }
  @Delete('combos/:id') @RequirePermissions('menu.write') deleteCombo(@Id() id: string) { return this.menu.softDeleteCombo(id); }
}
