import { makeRouter, permissions } from '../../common/router';
import { NotFoundException } from '../../common/errors';
import { prisma } from '../../services';

const select = { id: true, code: true, name: true, address: true, phone: true, isActive: true } as const;

/** Outlet discovery for POS/dashboard (tenant-scoped by RLS). Full outlet CRUD lands with tenant admin (Phase 2). */
export const outletsRoutes = makeRouter([
  {
    method: 'get',
    path: '/',
    policy: permissions('outlets.read'),
    tags: ['outlets'],
    summary: 'List outlets',
    handler: (req) =>
      prisma.scoped.outlet.findMany({
        where: { deletedAt: null, ...(req.query.includeInactive === 'true' ? {} : { isActive: true }) },
        orderBy: { code: 'asc' },
        select,
      }),
  },
  {
    method: 'get',
    path: '/:id',
    policy: permissions('outlets.read'),
    uuidParams: ['id'],
    tags: ['outlets'],
    summary: 'Get one outlet',
    handler: async (req) => {
      const o = await prisma.scoped.outlet.findFirst({ where: { id: req.params.id, deletedAt: null }, select });
      if (!o) throw new NotFoundException('Outlet not found');
      return o;
    },
  },
], '/v1/outlets');
