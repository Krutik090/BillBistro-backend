import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { ZodSchema } from 'zod';
import { RequirePermissions } from '../../auth/decorators';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { OrdersService } from './orders.service';
import * as S from './orders.schemas';

const Id = () => Param('id', ParseUUIDPipe);
const body = (s: ZodSchema) => Body(new ZodValidationPipe(s));
const query = (s: ZodSchema) => Query(new ZodValidationPipe(s));

/** Orders + KOTs. Server computes all money; client never sends amounts. */
@ApiTags('orders')
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('orders') @RequirePermissions('orders.read') list(@query(S.ListOrdersQuery) q: S.ListOrdersQuery) { return this.orders.list(q); }
  @Get('orders/:id') @RequirePermissions('orders.read') get(@Id() id: string) { return this.orders.get(id); }
  @Post('orders') @RequirePermissions('orders.write') create(@body(S.CreateOrder) d: S.CreateOrder) { return this.orders.create(d); }
  @Patch('orders/:id/items') @RequirePermissions('orders.write') replaceItems(@Id() id: string, @body(S.ReplaceItems) d: S.ReplaceItems) { return this.orders.replaceItems(id, d); }
  @Post('orders/:id/kots') @RequirePermissions('kots.write') createKot(@Id() id: string, @body(S.CreateKot) d: S.CreateKot) { return this.orders.createKot(id, d); }
  @Post('orders/:id/cancel') @RequirePermissions('orders.write') cancel(@Id() id: string, @body(S.CancelOrder) d: S.CancelOrder) { return this.orders.cancel(id, d); }

  /** KDS feed */
  @Get('kots') @RequirePermissions('kots.read') listKots(@query(S.ListKotsQuery) q: S.ListKotsQuery) { return this.orders.listKots(q); }
  @Patch('kots/:id/status') @RequirePermissions('kots.write') setKotStatus(@Id() id: string, @body(S.SetKotStatus) d: S.SetKotStatus) { return this.orders.setKotStatus(id, d); }
}
