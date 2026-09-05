import type { Request } from 'express';
import { outlets } from '../container';

export const list = (req: Request) => outlets.list(req.query.includeInactive === 'true');
export const get = (req: Request) => outlets.get(req.params.id);
