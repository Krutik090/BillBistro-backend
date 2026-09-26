import type { Request } from 'express';
import { customers } from '../container';
import { validQuery } from '../routes/router';
import type * as S from '../schemas/customers.schemas';

export const list = (req: Request) => customers.list(validQuery<S.ListCustomersQuery>(req));
export const get = (req: Request) => customers.get(req.params.id);
export const create = (req: Request) => customers.create(req.body as S.CreateCustomer);
export const update = (req: Request) => customers.update(req.params.id, req.body as S.UpdateCustomer);
export const remove = async (req: Request) => { await customers.delete(req.params.id); };
