import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { ZodSchema } from 'zod';
import { RequirePermissions } from '../../auth/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { BillingService } from './billing.service';
import * as S from './billing.schemas';

const Id = () => Param('id', ParseUUIDPipe);
const body = (s: ZodSchema) => Body(new ZodValidationPipe(s));
const query = (s: ZodSchema) => Query(new ZodValidationPipe(s));

/** Bills, payments, refunds, receipts, day-close. All money computed server-side. */
@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('bills') @RequirePermissions('bills.read') list(@query(S.ListBillsQuery) q: S.ListBillsQuery) { return this.billing.list(q); }
  @Get('bills/:id') @RequirePermissions('bills.read') get(@Id() id: string) { return this.billing.get(id); }
  @Get('bills/:id/receipt') @RequirePermissions('bills.read') receipt(@Id() id: string) { return this.billing.receipt(id); }
  @Post('bills') @RequirePermissions('bills.write') create(@body(S.CreateBill) d: S.CreateBill) { return this.billing.create(d); }
  @Patch('bills/:id') @RequirePermissions('bills.write') update(@Id() id: string, @body(S.UpdateBill) d: S.UpdateBill) { return this.billing.update(id, d); }
  @Post('bills/:id/finalize') @RequirePermissions('bills.write') finalize(@Id() id: string, @body(S.Finalize) d: S.Finalize) { return this.billing.finalize(id, d); }
  @Post('bills/:id/void') @RequirePermissions('bills.void') void(@Id() id: string, @body(S.VoidBill) d: S.VoidBill) { return this.billing.void(id, d); }
  @Post('bills/:id/payments') @RequirePermissions('payments.write') pay(@Id() id: string, @body(S.CreatePayment) d: S.CreatePayment) { return this.billing.pay(id, d); }
  @Post('payments/:id/refunds') @RequirePermissions('bills.void') refund(@Id() id: string, @body(S.CreateRefund) d: S.CreateRefund) { return this.billing.refund(id, d); }

  @Get('day-close') @RequirePermissions('reports.read') dayReport(@query(S.DayCloseQuery) q: S.DayCloseQuery) { return this.billing.dayReport(q); }
  @Post('day-close') @RequirePermissions('reports.read', 'bills.write') dayClose(@body(S.DayCloseInput) d: S.DayCloseInput) { return this.billing.dayClose(d); }
}
