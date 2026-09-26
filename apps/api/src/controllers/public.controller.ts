import type { Request } from 'express';
import { orders } from '../container';
import type * as S from '../schemas/orders.schemas';

/** Customer QR ordering — no staff session. Reuses OrdersService.create() exactly, same money math and validation as the staff path. */
export const createOrder = (req: Request) => orders.create(req.body as S.CreateOrder);
