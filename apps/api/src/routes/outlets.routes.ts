import { makeRouter, permissions } from './router';
import * as outletsController from '../controllers/outlets.controller';

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
  ],
  '/v1/outlets',
);
