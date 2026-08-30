"use client";
import * as React from "react";
import { createClient } from "@billbistro/sdk";
import { cn } from "@billbistro/ui";

/** Pings the API /health via the SDK stub — proves the client wiring, nothing more. */
export function HealthDot() {
  const [state, setState] = React.useState<"checking" | "ok" | "down">("checking");
  React.useEffect(() => {
    const api = createClient();
    api.health().then(() => setState("ok")).catch(() => setState("down"));
  }, []);
  return (
    <div className="flex h-touch items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-muted" title="API /health">
      <span className={cn("size-2 rounded-full", state === "ok" ? "bg-success" : state === "down" ? "bg-danger" : "bg-warning animate-pulse")} />
      API {state}
    </div>
  );
}
