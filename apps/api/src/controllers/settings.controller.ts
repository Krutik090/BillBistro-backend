import type { Request } from 'express';
import { settings } from '../container';
import type * as S from '../schemas/settings.schemas';

export const get = () => settings.get();
export const update = (req: Request) => settings.update(req.body as S.UpdateSettings);
