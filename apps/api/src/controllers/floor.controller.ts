import type { Request } from 'express';
import { floor } from '../container';
import { validQuery } from '../routes/router';
import type * as S from '../schemas/floor.schemas';

export const floorView = (req: Request) => floor.floor(req.params.outletId);

export const listSections = (req: Request) => floor.listSections(validQuery<S.OutletQuery>(req));
export const createSection = (req: Request) => floor.createSection(req.body as S.CreateSection);
export const updateSection = (req: Request) => floor.updateSection(req.params.id, req.body as S.UpdateSection);
export const deleteSection = (req: Request) => floor.deleteSection(req.params.id);

export const listTables = (req: Request) => floor.listTables(validQuery<S.ListTablesQuery>(req));
export const getTable = (req: Request) => floor.getTable(req.params.id);
export const createTable = (req: Request) => floor.createTable(req.body as S.CreateTable);
export const updateTable = (req: Request) => floor.updateTable(req.params.id, req.body as S.UpdateTable);
export const deleteTable = (req: Request) => floor.deleteTable(req.params.id);
export const setStatus = (req: Request) => floor.setStatus(req.params.id, req.body as S.SetTableStatus);
