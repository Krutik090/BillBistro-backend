import type { Request } from 'express';
import { reports } from '../container';
import { validQuery } from '../routes/router';
import type * as S from '../schemas/reports.schemas';

export const sales = (req: Request) => reports.sales(validQuery<S.ReportRangeQuery>(req));
export const items = (req: Request) => reports.items(validQuery<S.ReportRangeQuery>(req));
export const tax = (req: Request) => reports.tax(validQuery<S.ReportRangeQuery>(req));
