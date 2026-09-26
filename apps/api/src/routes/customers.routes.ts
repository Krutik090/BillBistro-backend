import { makeRouter, permissions, type RouteSpec } from './router';
import * as customersController from '../controllers/customers.controller';
import * as S from '../schemas/customers.schemas';

const READ = permissions('customers.read');
const WRITE = permissions('customers.write');
const tags = ['customers'];

/** Basic CRM (T-109) — a phone book. No loyalty/points/order-linking yet. */
const specs: RouteSpec[] = [
  { method: 'get', path: '/', policy: READ, query: S.ListCustomersQuery, tags, summary: 'List/search customers by name or phone', handler: customersController.list },
  { method: 'get', path: '/:id', policy: READ, uuidParams: ['id'], tags, handler: customersController.get },
  { method: 'post', path: '/', policy: WRITE, body: S.CreateCustomer, tags, handler: customersController.create },
  { method: 'patch', path: '/:id', policy: WRITE, uuidParams: ['id'], body: S.UpdateCustomer, tags, handler: customersController.update },
  { method: 'delete', path: '/:id', policy: WRITE, uuidParams: ['id'], status: 204, tags, handler: customersController.remove },
];

export const customersRoutes = makeRouter(specs, '/v1/customers');
