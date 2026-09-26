import { makeRouter, AUTHENTICATED, permissions, type RouteSpec } from './router';
import * as settingsController from '../controllers/settings.controller';
import { UpdateSettings } from '../schemas/settings.schemas';

const tags = ['settings'];

/** Business profile (Settings, T-109) — any signed-in staff can view; only the owner can edit. */
const specs: RouteSpec[] = [
  { method: 'get', path: '/', policy: AUTHENTICATED, tags, summary: 'Business profile (name, GSTIN, currency, timezone)', handler: settingsController.get },
  { method: 'patch', path: '/', policy: permissions('tenant.manage'), body: UpdateSettings, tags, summary: 'Update business profile (name/GSTIN)', handler: settingsController.update },
];

export const settingsRoutes = makeRouter(specs, '/v1/settings');
