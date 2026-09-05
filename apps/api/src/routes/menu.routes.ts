import { makeRouter, permissions, type RouteSpec } from './router';
import * as menuController from '../controllers/menu.controller';
import * as S from '../schemas/menu.schemas';

const READ = permissions('menu.read');
const WRITE = permissions('menu.write');
const tags = ['menu'];

/**
 * Menu catalogue. Tenant scope = RLS via prisma.scoped; RBAC = menu.read / menu.write.
 * Money is integer paise; tax in basis points.
 */
const specs: RouteSpec[] = [
  // ----- effective menu for POS / QR -----
  {
    method: 'get',
    path: '/outlets/:outletId/effective',
    policy: READ,
    uuidParams: ['outletId'],
    tags,
    summary: 'Resolved menu for an outlet (schedules, per-outlet prices, availability)',
    handler: menuController.effective,
  },

  // ----- schedules -----
  { method: 'get', path: '/schedules', policy: READ, tags, handler: menuController.listSchedules },
  { method: 'post', path: '/schedules', policy: WRITE, body: S.CreateSchedule, tags, handler: menuController.createSchedule },
  { method: 'patch', path: '/schedules/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateSchedule, tags, handler: menuController.updateSchedule },
  { method: 'delete', path: '/schedules/:id', policy: WRITE, uuidParams: ['id'], tags, handler: menuController.deleteSchedule },

  // ----- categories -----
  { method: 'get', path: '/categories', policy: READ, tags, handler: menuController.listCategories },
  { method: 'post', path: '/categories', policy: WRITE, body: S.CreateCategory, tags, handler: menuController.createCategory },
  { method: 'patch', path: '/categories/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateCategory, tags, handler: menuController.updateCategory },
  { method: 'delete', path: '/categories/:id', policy: WRITE, uuidParams: ['id'], tags, handler: menuController.deleteCategory },

  // ----- items -----
  { method: 'get', path: '/items', policy: READ, query: S.ListItemsQuery, tags, handler: menuController.listItems },
  { method: 'get', path: '/items/:id', policy: READ, uuidParams: ['id'], tags, handler: menuController.getItem },
  { method: 'post', path: '/items', policy: WRITE, body: S.CreateItem, tags, handler: menuController.createItem },
  { method: 'patch', path: '/items/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateItem, tags, handler: menuController.updateItem },
  { method: 'delete', path: '/items/:id', policy: WRITE, uuidParams: ['id'], tags, handler: menuController.deleteItem },

  // ----- variants -----
  { method: 'post', path: '/items/:id/variants', policy: WRITE, uuidParams: ['id'], body: S.CreateVariant, tags, handler: menuController.createVariant },
  { method: 'patch', path: '/variants/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateVariant, tags, handler: menuController.updateVariant },
  { method: 'delete', path: '/variants/:id', policy: WRITE, uuidParams: ['id'], tags, handler: menuController.deleteVariant },

  // ----- modifier groups / options -----
  { method: 'get', path: '/modifier-groups', policy: READ, tags, handler: menuController.listModifierGroups },
  { method: 'post', path: '/modifier-groups', policy: WRITE, body: S.CreateModifierGroup, tags, handler: menuController.createModifierGroup },
  { method: 'patch', path: '/modifier-groups/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateModifierGroup, tags, handler: menuController.updateModifierGroup },
  { method: 'delete', path: '/modifier-groups/:id', policy: WRITE, uuidParams: ['id'], tags, handler: menuController.deleteModifierGroup },
  { method: 'post', path: '/modifier-groups/:id/options', policy: WRITE, uuidParams: ['id'], body: S.CreateModifierOption, tags, handler: menuController.createOption },
  { method: 'patch', path: '/modifier-options/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateModifierOption, tags, handler: menuController.updateOption },
  { method: 'delete', path: '/modifier-options/:id', policy: WRITE, uuidParams: ['id'], tags, handler: menuController.deleteOption },
  { method: 'put', path: '/items/:id/modifier-groups', policy: WRITE, uuidParams: ['id'], body: S.SetItemModifierGroups, tags, handler: menuController.setItemGroups },

  // ----- per-outlet pricing / availability -----
  { method: 'get', path: '/items/:id/pricing', policy: READ, uuidParams: ['id'], tags, handler: menuController.listPricing },
  { method: 'put', path: '/items/:id/pricing', policy: WRITE, uuidParams: ['id'], body: S.UpsertOutletPrices, tags, handler: menuController.upsertPricing },

  // ----- combos -----
  { method: 'get', path: '/combos', policy: READ, tags, handler: menuController.listCombos },
  { method: 'post', path: '/combos', policy: WRITE, body: S.CreateCombo, tags, handler: menuController.createCombo },
  { method: 'patch', path: '/combos/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateCombo, tags, handler: menuController.updateCombo },
  { method: 'delete', path: '/combos/:id', policy: WRITE, uuidParams: ['id'], tags, handler: menuController.deleteCombo },
];

export const menuRoutes = makeRouter(specs, '/v1/menu');
