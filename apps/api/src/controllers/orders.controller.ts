import type { Request } from 'express';
import { orders } from '../container';
import { validQuery } from '../routes/router';
import type * as S from '../schemas/orders.schemas';

export const list = (req: Request) => orders.list(validQuery<S.ListOrdersQuery>(req));
export const get = (req: Request) => orders.get(req.params.id);
export const create = (req: Request) => orders.create(req.body as S.CreateOrder);
export const replaceItems = (req: Request) => orders.replaceItems(req.params.id, req.body as S.ReplaceItems);
export const createKot = (req: Request) => orders.createKot(req.params.id, req.body as S.CreateKot);
export const cancel = (req: Request) => orders.cancel(req.params.id, req.body as S.CancelOrder);

// KDS feed
export const listKots = (req: Request) => orders.listKots(validQuery<S.ListKotsQuery>(req));
export const setKotStatus = (req: Request) => orders.setKotStatus(req.params.id, req.body as S.SetKotStatus);
