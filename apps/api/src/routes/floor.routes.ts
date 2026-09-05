import { makeRouter, permissions, type RouteSpec } from './router';
import * as floorController from '../controllers/floor.controller';
import * as S from '../schemas/floor.schemas';

const READ = permissions('tables.read');
const WRITE = permissions('tables.write');
const tags = ['floor'];

/** Floor management: sections, tables, live occupancy. RBAC tables.read / tables.write. */
const specs: RouteSpec[] = [
  {
    method: 'get',
    path: '/outlets/:outletId',
    policy: READ,
    uuidParams: ['outletId'],
    tags,
    summary: 'Live floor view for an outlet (sections + tables + occupancy)',
    handler: floorController.floorView,
  },

  { method: 'get', path: '/sections', policy: READ, query: S.OutletQuery, tags, handler: floorController.listSections },
  { method: 'post', path: '/sections', policy: WRITE, body: S.CreateSection, tags, handler: floorController.createSection },
  { method: 'patch', path: '/sections/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateSection, tags, handler: floorController.updateSection },
  { method: 'delete', path: '/sections/:id', policy: WRITE, uuidParams: ['id'], tags, handler: floorController.deleteSection },

  { method: 'get', path: '/tables', policy: READ, query: S.ListTablesQuery, tags, handler: floorController.listTables },
  { method: 'get', path: '/tables/:id', policy: READ, uuidParams: ['id'], tags, handler: floorController.getTable },
  { method: 'post', path: '/tables', policy: WRITE, body: S.CreateTable, tags, handler: floorController.createTable },
  { method: 'patch', path: '/tables/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateTable, tags, handler: floorController.updateTable },
  { method: 'delete', path: '/tables/:id', policy: WRITE, uuidParams: ['id'], tags, handler: floorController.deleteTable },
  {
    method: 'post',
    path: '/tables/:id/status',
    policy: WRITE,
    uuidParams: ['id'],
    body: S.SetTableStatus,
    tags,
    summary: 'Move a table through the occupancy state machine (optimistic `version`)',
    handler: floorController.setStatus,
  },
];

export const floorRoutes = makeRouter(specs, '/v1/floor');
