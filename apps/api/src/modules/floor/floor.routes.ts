import { makeRouter, permissions, validQuery, type RouteSpec } from '../../common/router';
import { floor } from '../../services';
import * as S from './floor.schemas';

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
    handler: (req) => floor.floor(req.params.outletId),
  },

  { method: 'get', path: '/sections', policy: READ, query: S.OutletQuery, tags, handler: (req) => floor.listSections(validQuery(req)) },
  { method: 'post', path: '/sections', policy: WRITE, body: S.CreateSection, tags, handler: (req) => floor.createSection(req.body) },
  { method: 'patch', path: '/sections/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateSection, tags, handler: (req) => floor.updateSection(req.params.id, req.body) },
  { method: 'delete', path: '/sections/:id', policy: WRITE, uuidParams: ['id'], tags, handler: (req) => floor.deleteSection(req.params.id) },

  { method: 'get', path: '/tables', policy: READ, query: S.ListTablesQuery, tags, handler: (req) => floor.listTables(validQuery(req)) },
  { method: 'get', path: '/tables/:id', policy: READ, uuidParams: ['id'], tags, handler: (req) => floor.getTable(req.params.id) },
  { method: 'post', path: '/tables', policy: WRITE, body: S.CreateTable, tags, handler: (req) => floor.createTable(req.body) },
  { method: 'patch', path: '/tables/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateTable, tags, handler: (req) => floor.updateTable(req.params.id, req.body) },
  { method: 'delete', path: '/tables/:id', policy: WRITE, uuidParams: ['id'], tags, handler: (req) => floor.deleteTable(req.params.id) },
  {
    method: 'post',
    path: '/tables/:id/status',
    policy: WRITE,
    uuidParams: ['id'],
    body: S.SetTableStatus,
    tags,
    summary: 'Move a table through the occupancy state machine (optimistic `version`)',
    handler: (req) => floor.setStatus(req.params.id, req.body),
  },
];

export const floorRoutes = makeRouter(specs, '/v1/floor');
