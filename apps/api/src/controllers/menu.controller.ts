import type { Request } from 'express';
import { menu } from '../container';
import { validQuery } from '../routes/router';
import type * as S from '../schemas/menu.schemas';

// ----- effective menu for POS / QR -----
export const effective = (req: Request) =>
  menu.effectiveMenu(req.params.outletId, req.query.at ? new Date(String(req.query.at)) : new Date());

// ----- schedules -----
export const listSchedules = () => menu.listSchedules();
export const createSchedule = (req: Request) => menu.createSchedule(req.body as S.CreateSchedule);
export const updateSchedule = (req: Request) => menu.updateSchedule(req.params.id, req.body as S.UpdateSchedule);
export const deleteSchedule = (req: Request) => menu.softDeleteSchedule(req.params.id);

// ----- categories -----
export const listCategories = (req: Request) => menu.listCategories(req.query.includeInactive === 'true');
export const createCategory = (req: Request) => menu.createCategory(req.body as S.CreateCategory);
export const updateCategory = (req: Request) => menu.updateCategory(req.params.id, req.body as S.UpdateCategory);
export const deleteCategory = (req: Request) => menu.softDeleteCategory(req.params.id);

// ----- items -----
export const listItems = (req: Request) => menu.listItems(validQuery<S.ListItemsQuery>(req));
export const getItem = (req: Request) => menu.getItem(req.params.id, req.query.outletId as string | undefined);
export const createItem = (req: Request) => menu.createItem(req.body as S.CreateItem);
export const updateItem = (req: Request) => menu.updateItem(req.params.id, req.body as S.UpdateItem);
export const deleteItem = (req: Request) => menu.softDeleteItem(req.params.id);

// ----- variants -----
export const createVariant = (req: Request) => menu.createVariant(req.params.id, req.body as S.CreateVariant);
export const updateVariant = (req: Request) => menu.updateVariant(req.params.id, req.body as S.UpdateVariant);
export const deleteVariant = (req: Request) => menu.softDeleteVariant(req.params.id);

// ----- modifier groups / options -----
export const listModifierGroups = () => menu.listModifierGroups();
export const createModifierGroup = (req: Request) => menu.createModifierGroup(req.body as S.CreateModifierGroup);
export const updateModifierGroup = (req: Request) => menu.updateModifierGroup(req.params.id, req.body as S.UpdateModifierGroup);
export const deleteModifierGroup = (req: Request) => menu.softDeleteModifierGroup(req.params.id);
export const createOption = (req: Request) => menu.createModifierOption(req.params.id, req.body as S.CreateModifierOption);
export const updateOption = (req: Request) => menu.updateModifierOption(req.params.id, req.body as S.UpdateModifierOption);
export const deleteOption = (req: Request) => menu.softDeleteModifierOption(req.params.id);
export const setItemGroups = (req: Request) => menu.setItemModifierGroups(req.params.id, (req.body as S.SetItemModifierGroups).groupIds);

// ----- per-outlet pricing / availability -----
export const listPricing = (req: Request) => menu.listOutletPrices(req.params.id);
export const upsertPricing = (req: Request) => menu.upsertOutletPrices(req.params.id, (req.body as S.UpsertOutletPrices).prices);

// ----- combos -----
export const listCombos = (req: Request) => menu.listCombos(req.query.includeUnavailable === 'true');
export const createCombo = (req: Request) => menu.createCombo(req.body as S.CreateCombo);
export const updateCombo = (req: Request) => menu.updateCombo(req.params.id, req.body as S.UpdateCombo);
export const deleteCombo = (req: Request) => menu.softDeleteCombo(req.params.id);
