import { makeRouter, permissions } from './router';
import * as outletsController from '../controllers/outlets.controller';
import { UpdateOutlet } from '../schemas/outlets.schemas';

export const outletsRoutes = makeRouter(
  [
    {
      method: 'get',
      path: '/',
      policy: permissions('outlets.read'),
      tags: ['outlets'],
      summary: 'List outlets',
      handler: outletsController.list,
    },
    {
      method: 'get',
      path: '/:id',
      policy: permissions('outlets.read'),
      uuidParams: ['id'],
      tags: ['outlets'],
      summary: 'Get one outlet',
      handler: outletsController.get,
    },
    {
      method: 'patch',
      path: '/:id',
      policy: permissions('outlets.write'),
      uuidParams: ['id'],
      body: UpdateOutlet,
      tags: ['outlets'],
      summary: 'Update outlet profile (name/address/phone) — Settings',
      handler: outletsController.update,
    },
  ],
  '/v1/outlets',
);
