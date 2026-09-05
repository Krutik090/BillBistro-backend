import { makeRouter, permissions, type RouteSpec } from './router';
import * as billingController from '../controllers/billing.controller';
import * as S from '../schemas/billing.schemas';

const tags = ['billing'];

/** Bills, payments, refunds, receipts, day-close. All money computed server-side. */
const specs: RouteSpec[] = [
  { method: 'get', path: '/bills', policy: permissions('bills.read'), query: S.ListBillsQuery, tags, handler: billingController.list },
  { method: 'get', path: '/bills/:id', policy: permissions('bills.read'), uuidParams: ['id'], tags, handler: billingController.get },
  { method: 'get', path: '/bills/:id/receipt', policy: permissions('bills.read'), uuidParams: ['id'], tags, summary: '80mm-ready receipt payload (lines, tax summary, payments)', handler: billingController.receipt },
  {
    method: 'post',
    path: '/bills',
    policy: permissions('bills.write'),
    body: S.CreateBill,
    tags,
    summary: 'Create a bill from an order (merge, equal-N split, discount-before-tax, tip)',
    handler: billingController.create,
  },
  { method: 'patch', path: '/bills/:id', policy: permissions('bills.write'), uuidParams: ['id'], body: S.UpdateBill, tags, summary: 'Adjust discount/tip while DRAFT', handler: billingController.update },
  { method: 'post', path: '/bills/:id/finalize', policy: permissions('bills.write'), uuidParams: ['id'], body: S.Finalize, tags, handler: billingController.finalize },
  { method: 'post', path: '/bills/:id/void', policy: permissions('bills.void'), uuidParams: ['id'], body: S.VoidBill, tags, handler: billingController.voidBill },
  {
    method: 'post',
    path: '/bills/:id/payments',
    policy: permissions('payments.write'),
    uuidParams: ['id'],
    body: S.CreatePayment,
    tags,
    summary: 'Capture a payment (idempotencyKey replays return the original row)',
    handler: billingController.pay,
  },
  { method: 'post', path: '/payments/:id/refunds', policy: permissions('bills.void'), uuidParams: ['id'], body: S.CreateRefund, tags, handler: billingController.refund },

  { method: 'get', path: '/day-close', policy: permissions('reports.read'), query: S.DayCloseQuery, tags: ['day-close'], summary: 'Z-report for a business date', handler: billingController.dayReport },
  { method: 'post', path: '/day-close', policy: permissions('reports.read', 'bills.write'), body: S.DayCloseInput, tags: ['day-close'], summary: 'Close the business date (blocks later finalize/pay)', handler: billingController.dayClose },
];

export const billingRoutes = makeRouter(specs, '/v1');
