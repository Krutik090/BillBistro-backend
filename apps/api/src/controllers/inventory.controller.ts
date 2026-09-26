import type { Request } from 'express';
import { inventory } from '../container';
import { validQuery } from '../routes/router';
import type * as S from '../schemas/inventory.schemas';

export const list = (req: Request) => inventory.list(validQuery<S.ListInventoryQuery>(req));
export const get = (req: Request) => inventory.get(req.params.id);
export const create = (req: Request) => inventory.create(req.body as S.CreateInventoryItem);
export const update = (req: Request) => inventory.update(req.params.id, req.body as S.UpdateInventoryItem);
export const adjust = (req: Request) => inventory.adjust(req.params.id, req.body as S.AdjustStock);
export const movements = (req: Request) => inventory.movements(req.params.id, validQuery<S.ListMovementsQuery>(req));

export const recipe = (req: Request) => inventory.recipe(validQuery<S.RecipeQuery>(req).menuItemId);
export const setRecipe = (req: Request) => inventory.setRecipe(req.params.menuItemId, req.body as S.SetRecipe);
