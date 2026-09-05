import { prisma } from './prisma/prisma.service';
import { jwtService } from './common/jwt';
import { AuditService } from './audit/audit.service';
import { AuthService } from './auth/auth.service';
import { MenuService } from './modules/menu/menu.service';
import { FloorService } from './modules/floor/floor.service';
import { OrdersService } from './modules/orders/orders.service';
import { BillingService } from './modules/billing/billing.service';

/**
 * Composition root — the DI container Nest used to build, written out explicitly.
 * Wiring is a handful of `new` calls, and the dependency graph is readable in one screen.
 */
export const audit = new AuditService(prisma);
export const auth = new AuthService(prisma, jwtService, audit);
export const menu = new MenuService(prisma, audit);
export const floor = new FloorService(prisma);
export const orders = new OrdersService(prisma, audit);
export const billing = new BillingService(prisma, audit);

export { prisma };
