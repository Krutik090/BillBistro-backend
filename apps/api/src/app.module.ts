import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { env } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { TenantContextInterceptor } from './tenancy/tenant-context.interceptor';
import { MenuModule } from './modules/menu/menu.module';
import { OrdersModule } from './modules/orders/orders.module';

@Module({
  imports: [
    // global per-IP rate limit; auth routes override with tighter @Throttle() values
    ThrottlerModule.forRoot([{ name: 'default', ttl: env.THROTTLE_TTL_MS, limit: env.THROTTLE_LIMIT }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    MenuModule,
    OrdersModule,
  ],
  controllers: [HealthController],
  providers: [
    // order matters: rate-limit -> authenticate -> authorize (deny-by-default) -> bind tenant context
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
