// @billbistro/sdk — typed API client stub. Phase 0: only /health. Later phases add
// generated endpoints from the NestJS OpenAPI spec and share Zod schemas via @billbistro/types.

export interface HealthResponse {
  status: "ok" | string;
  version?: string;
  uptime?: number;
  [k: string]: unknown;
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message?: string) {
    super(message ?? `API error ${status}`);
  }
}

export interface ClientOptions {
  baseUrl?: string;
  /** Tenant slug/ID sent as x-tenant-id (auth cookie carries the real scope). */
  tenantId?: string;
  fetch?: typeof fetch;
}

export function createClient(opts: ClientOptions = {}) {
  const baseUrl = (opts.baseUrl ?? (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : undefined) ?? "http://localhost:4000").replace(/\/$/, "");
  const f = opts.fetch ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await f(`${baseUrl}${path}`, {
      credentials: "include",
      ...init,
      headers: { "content-type": "application/json", ...(opts.tenantId ? { "x-tenant-id": opts.tenantId } : {}), ...(init.headers ?? {}) },
    });
    const body = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
    if (!res.ok) throw new ApiError(res.status, body);
    return body as T;
  }

  return {
    baseUrl,
    health: () => request<HealthResponse>("/health"),
    request,
  };
}

export type ApiClient = ReturnType<typeof createClient>;
