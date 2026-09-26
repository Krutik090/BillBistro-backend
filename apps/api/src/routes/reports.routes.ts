import { makeRouter, permissions, type RouteSpec } from './router';
import * as reportsController from '../controllers/reports.controller';
import * as S from '../schemas/reports.schemas';

const tags = ['reports'];

/** Read-only sales/item/tax analytics over a date range (T-104). Reuses bill/bill-line money fields. */
const specs: RouteSpec[] = [
  { method: 'get', path: '/reports/sales', policy: permissions('reports.read'), query: S.ReportRangeQuery, tags, summary: 'Sales summary over a date range (gross/discount/tax/tip/net, collections by payment mode, voids)', handler: reportsController.sales },
  { method: 'get', path: '/reports/items', policy: permissions('reports.read'), query: S.ReportRangeQuery, tags, summary: 'Item-wise sales over a date range (qty, gross, discount, tax, net)', handler: reportsController.items },
  { method: 'get', path: '/reports/tax', policy: permissions('reports.read'), query: S.ReportRangeQuery, tags, summary: 'GST summary over a date range, broken down by tax rate bracket', handler: reportsController.tax },
];

export const reportsRoutes = makeRouter(specs, '/v1');
