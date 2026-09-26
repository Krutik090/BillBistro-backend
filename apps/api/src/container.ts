import { prisma } from './database/client';
import { jwtService } from './utils/jwt';
import { AuditService } from './services/audit.service';
import { AuthService } from './services/auth.service';
import { MenuService } from './services/menu.service';
import { FloorService } from './services/floor.service';
import { OrdersService } from './services/orders.service';
import { BillingService } from './services/billing.service';
import { OutletsService } from './services/outlets.service';
import { ReportsService } from './services/reports.service';
import { InventoryService } from './services/inventory.service';
import { CustomersService } from './services/customers.service';
import { SettingsService } from './services/settings.service';

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
export const outlets = new OutletsService(prisma);
export const reports = new ReportsService(prisma);
export const inventory = new InventoryService(prisma, audit);
export const customers = new CustomersService(prisma);
export const settings = new SettingsService(prisma);

export { prisma };
