import { makeRouter, permissions, validQuery, type RouteSpec } from '../../common/router';
import { menu } from '../../services';
import * as S from './menu.schemas';

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
    handler: (req) => menu.effectiveMenu(req.params.outletId, req.query.at ? new Date(String(req.query.at)) : new Date()),
  },

  // ----- schedules -----
  { method: 'get', path: '/schedules', policy: READ, tags, handler: () => menu.listSchedules() },
  { method: 'post', path: '/schedules', policy: WRITE, body: S.CreateSchedule, tags, handler: (req) => menu.createSchedule(req.body) },
  { method: 'patch', path: '/schedules/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateSchedule, tags, handler: (req) => menu.updateSchedule(req.params.id, req.body) },
  { method: 'delete', path: '/schedules/:id', policy: WRITE, uuidParams: ['id'], tags, handler: (req) => menu.softDeleteSchedule(req.params.id) },

  // ----- categories -----
  { method: 'get', path: '/categories', policy: READ, tags, handler: (req) => menu.listCategories(req.query.includeInactive === 'true') },
  { method: 'post', path: '/categories', policy: WRITE, body: S.CreateCategory, tags, handler: (req) => menu.createCategory(req.body) },
  { method: 'patch', path: '/categories/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateCategory, tags, handler: (req) => menu.updateCategory(req.params.id, req.body) },
  { method: 'delete', path: '/categories/:id', policy: WRITE, uuidParams: ['id'], tags, handler: (req) => menu.softDeleteCategory(req.params.id) },

  // ----- items -----
  { method: 'get', path: '/items', policy: READ, query: S.ListItemsQuery, tags, handler: (req) => menu.listItems(validQuery(req)) },
  { method: 'get', path: '/items/:id', policy: READ, uuidParams: ['id'], tags, handler: (req) => menu.getItem(req.params.id, req.query.outletId as string | undefined) },
  { method: 'post', path: '/items', policy: WRITE, body: S.CreateItem, tags, handler: (req) => menu.createItem(req.body) },
  { method: 'patch', path: '/items/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateItem, tags, handler: (req) => menu.updateItem(req.params.id, req.body) },
  { method: 'delete', path: '/items/:id', policy: WRITE, uuidParams: ['id'], tags, handler: (req) => menu.softDeleteItem(req.params.id) },

  // ----- variants -----
  { method: 'post', path: '/items/:id/variants', policy: WRITE, uuidParams: ['id'], body: S.CreateVariant, tags, handler: (req) => menu.createVariant(req.params.id, req.body) },
  { method: 'patch', path: '/variants/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateVariant, tags, handler: (req) => menu.updateVariant(req.params.id, req.body) },
  { method: 'delete', path: '/variants/:id', policy: WRITE, uuidParams: ['id'], tags, handler: (req) => menu.softDeleteVariant(req.params.id) },

  // ----- modifier groups / options -----
  { method: 'get', path: '/modifier-groups', policy: READ, tags, handler: () => menu.listModifierGroups() },
  { method: 'post', path: '/modifier-groups', policy: WRITE, body: S.CreateModifierGroup, tags, handler: (req) => menu.createModifierGroup(req.body) },
  { method: 'patch', path: '/modifier-groups/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateModifierGroup, tags, handler: (req) => menu.updateModifierGroup(req.params.id, req.body) },
  { method: 'delete', path: '/modifier-groups/:id', policy: WRITE, uuidParams: ['id'], tags, handler: (req) => menu.softDeleteModifierGroup(req.params.id) },
  { method: 'post', path: '/modifier-groups/:id/options', policy: WRITE, uuidParams: ['id'], body: S.CreateModifierOption, tags, handler: (req) => menu.createModifierOption(req.params.id, req.body) },
  { method: 'patch', path: '/modifier-options/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateModifierOption, tags, handler: (req) => menu.updateModifierOption(req.params.id, req.body) },
  { method: 'delete', path: '/modifier-options/:id', policy: WRITE, uuidParams: ['id'], tags, handler: (req) => menu.softDeleteModifierOption(req.params.id) },
  { method: 'put', path: '/items/:id/modifier-groups', policy: WRITE, uuidParams: ['id'], body: S.SetItemModifierGroups, tags, handler: (req) => menu.setItemModifierGroups(req.params.id, req.body.groupIds) },

  // ----- per-outlet pricing / availability -----
  { method: 'get', path: '/items/:id/pricing', policy: READ, uuidParams: ['id'], tags, handler: (req) => menu.listOutletPrices(req.params.id) },
  { method: 'put', path: '/items/:id/pricing', policy: WRITE, uuidParams: ['id'], body: S.UpsertOutletPrices, tags, handler: (req) => menu.upsertOutletPrices(req.params.id, req.body.prices) },

  // ----- combos -----
  { method: 'get', path: '/combos', policy: READ, tags, handler: (req) => menu.listCombos(req.query.includeUnavailable === 'true') },
  { method: 'post', path: '/combos', policy: WRITE, body: S.CreateCombo, tags, handler: (req) => menu.createCombo(req.body) },
  { method: 'patch', path: '/combos/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateCombo, tags, handler: (req) => menu.updateCombo(req.params.id, req.body) },
  { method: 'delete', path: '/combos/:id', policy: WRITE, uuidParams: ['id'], tags, handler: (req) => menu.softDeleteCombo(req.params.id) },
];

export const menuRoutes = makeRouter(specs, '/v1/menu');
