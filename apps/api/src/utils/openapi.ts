import { zodToJsonSchema } from 'zod-to-json-schema';
import { routeRegistry, type RouteSpec } from '../routes/router';

/**
 * Nest generated the OpenAPI document from decorators. Here the route registry already knows every
 * path, method, policy and Zod schema, so the same document is derived from the routes themselves —
 * it cannot drift from what is actually served.
 */
const toSchema = (spec: RouteSpec, which: 'body' | 'query') => {
  const schema = spec[which];
  if (!schema) return undefined;
  // `never` keeps tsc from walking the full recursive Zod type for every schema in the registry.
  const json = zodToJsonSchema(schema as never, { target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
};

const describePolicy = (spec: RouteSpec): string =>
  spec.policy.kind === 'public'
    ? 'Public — no authentication.'
    : spec.policy.kind === 'authenticated'
      ? 'Any authenticated session.'
      : `Requires permission: ${spec.policy.required.join(', ')}.`;

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const spec of routeRegistry) {
    // Express ":id" → OpenAPI "{id}"
    const path = spec.fullPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const params = [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string', format: m[1].toLowerCase().includes('id') ? 'uuid' : undefined },
    }));

    const querySchema = toSchema(spec, 'query') as { properties?: Record<string, unknown>; required?: string[] } | undefined;
    for (const [name, schema] of Object.entries(querySchema?.properties ?? {})) {
      params.push({ name, in: 'query', required: querySchema?.required?.includes(name) ?? false, schema: schema as never });
    }

    const bodySchema = toSchema(spec, 'body');
    (paths[path] ??= {})[spec.method] = {
      tags: spec.tags ?? ['default'],
      summary: spec.summary,
      description: describePolicy(spec),
      security: spec.policy.kind === 'public' ? [] : [{ cookieAuth: [] }, { bearerAuth: [] }],
      parameters: params.length ? params : undefined,
      ...(bodySchema ? { requestBody: { required: true, content: { 'application/json': { schema: bodySchema } } } } : {}),
      responses: {
        [String(spec.status ?? (spec.method === 'post' ? 201 : 200))]: { description: 'Success' },
        '400': { description: 'Validation failed' },
        ...(spec.policy.kind === 'public' ? {} : { '401': { description: 'Missing/invalid token' }, '403': { description: 'Missing permission' } }),
      },
    };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'BillBistro API',
      version: process.env.npm_package_version ?? '0.0.1',
      description:
        'Multi-tenant restaurant POS. Money is integer paise, tax in basis points; every tenant table is isolated by Postgres row-level security.',
    },
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'access_token' },
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    paths,
  };
}
