import { makeRouter, permissions, type RouteSpec } from './router';
import * as inventoryController from '../controllers/inventory.controller';
import * as S from '../schemas/inventory.schemas';

const tags = ['inventory'];

/** Basic inventory (T-107): stock levels, a manual ledger, and recipe-based auto-deduction on KOT send. */
const specs: RouteSpec[] = [
  { method: 'get', path: '/inventory/items', policy: permissions('inventory.read'), query: S.ListInventoryQuery, tags, summary: 'List stock items (optionally low-stock only)', handler: inventoryController.list },
  { method: 'get', path: '/inventory/items/:id', policy: permissions('inventory.read'), uuidParams: ['id'], tags, handler: inventoryController.get },
  { method: 'post', path: '/inventory/items', policy: permissions('inventory.write'), body: S.CreateInventoryItem, tags, handler: inventoryController.create },
  { method: 'patch', path: '/inventory/items/:id', policy: permissions('inventory.write'), uuidParams: ['id'], body: S.UpdateInventoryItem, tags, handler: inventoryController.update },
  { method: 'post', path: '/inventory/items/:id/adjust', policy: permissions('inventory.write'), uuidParams: ['id'], body: S.AdjustStock, tags, summary: 'Record a stock movement (receive/waste/correction) and update the balance', handler: inventoryController.adjust },
  { method: 'get', path: '/inventory/items/:id/movements', policy: permissions('inventory.read'), uuidParams: ['id'], query: S.ListMovementsQuery, tags, summary: 'Stock ledger for one item, newest first', handler: inventoryController.movements },

  { method: 'get', path: '/inventory/recipes', policy: permissions('inventory.read'), query: S.RecipeQuery, tags: ['recipes'], summary: 'Recipe lines for one menu item', handler: inventoryController.recipe },
  { method: 'put', path: '/inventory/recipes/:menuItemId', policy: permissions('inventory.write'), uuidParams: ['menuItemId'], body: S.SetRecipe, tags: ['recipes'], summary: 'Replace the full recipe for one menu item', handler: inventoryController.setRecipe },
];

export const inventoryRoutes = makeRouter(specs, '/v1');
