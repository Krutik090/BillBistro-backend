import type { Request } from 'express';
import { outlets } from '../container';
import type * as S from '../schemas/outlets.schemas';

export const list = (req: Request) => outlets.list(req.query.includeInactive === 'true');
export const get = (req: Request) => outlets.get(req.params.id);
export const update = (req: Request) => outlets.update(req.params.id, req.body as S.UpdateOutlet);
