import { makeRouter, permissions, validQuery, type RouteSpec } from '../../common/router';
import { billing } from '../../services';
import * as S from './billing.schemas';

const tags = ['billing'];

/** Bills, payments, refunds, receipts, day-close. All money computed server-side. */
const specs: RouteSpec[] = [
  { method: 'get', path: '/bills', policy: permissions('bills.read'), query: S.ListBillsQuery, tags, handler: (req) => billing.list(validQuery(req)) },
  { method: 'get', path: '/bills/:id', policy: permissions('bills.read'), uuidParams: ['id'], tags, handler: (req) => billing.get(req.params.id) },
  { method: 'get', path: '/bills/:id/receipt', policy: permissions('bills.read'), uuidParams: ['id'], tags, summary: '80mm-ready receipt payload (lines, tax summary, payments)', handler: (req) => billing.receipt(req.params.id) },
  {
    method: 'post',
    path: '/bills',
    policy: permissions('bills.write'),
    body: S.CreateBill,
    tags,
    summary: 'Create a bill from an order (merge, equal-N split, discount-before-tax, tip)',
    handler: (req) => billing.create(req.body),
  },
  { method: 'patch', path: '/bills/:id', policy: permissions('bills.write'), uuidParams: ['id'], body: S.UpdateBill, tags, summary: 'Adjust discount/tip while DRAFT', handler: (req) => billing.update(req.params.id, req.body) },
  { method: 'post', path: '/bills/:id/finalize', policy: permissions('bills.write'), uuidParams: ['id'], body: S.Finalize, tags, handler: (req) => billing.finalize(req.params.id, req.body) },
  { method: 'post', path: '/bills/:id/void', policy: permissions('bills.void'), uuidParams: ['id'], body: S.VoidBill, tags, handler: (req) => billing.void(req.params.id, req.body) },
  {
    method: 'post',
    path: '/bills/:id/payments',
    policy: permissions('payments.write'),
    uuidParams: ['id'],
    body: S.CreatePayment,
    tags,
    summary: 'Capture a payment (idempotencyKey replays return the original row)',
    handler: (req) => billing.pay(req.params.id, req.body),
  },
  { method: 'post', path: '/payments/:id/refunds', policy: permissions('bills.void'), uuidParams: ['id'], body: S.CreateRefund, tags, handler: (req) => billing.refund(req.params.id, req.body) },

  { method: 'get', path: '/day-close', policy: permissions('reports.read'), query: S.DayCloseQuery, tags: ['day-close'], summary: 'Z-report for a business date', handler: (req) => billing.dayReport(validQuery(req)) },
  { method: 'post', path: '/day-close', policy: permissions('reports.read', 'bills.write'), body: S.DayCloseInput, tags: ['day-close'], summary: 'Close the business date (blocks later finalize/pay)', handler: (req) => billing.dayClose(req.body) },
];

export const billingRoutes = makeRouter(specs, '/v1');
