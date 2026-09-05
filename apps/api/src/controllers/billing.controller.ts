import type { Request } from 'express';
import { billing } from '../container';
import { validQuery } from '../routes/router';
import type * as S from '../schemas/billing.schemas';

export const list = (req: Request) => billing.list(validQuery<S.ListBillsQuery>(req));
export const get = (req: Request) => billing.get(req.params.id);
export const receipt = (req: Request) => billing.receipt(req.params.id);
export const create = (req: Request) => billing.create(req.body as S.CreateBill);
export const update = (req: Request) => billing.update(req.params.id, req.body as S.UpdateBill);
export const finalize = (req: Request) => billing.finalize(req.params.id, req.body as S.Finalize);
export const voidBill = (req: Request) => billing.void(req.params.id, req.body as S.VoidBill);
export const pay = (req: Request) => billing.pay(req.params.id, req.body as S.CreatePayment);
export const refund = (req: Request) => billing.refund(req.params.id, req.body as S.CreateRefund);

export const dayReport = (req: Request) => billing.dayReport(validQuery<S.DayCloseQuery>(req));
export const dayClose = (req: Request) => billing.dayClose(req.body as S.DayCloseInput);
