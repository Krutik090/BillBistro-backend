"use client";
import * as React from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { cn } from "../lib/cn";
import { Badge } from "./badge";

export interface KpiTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  /** Numeric value — animates from 0 on mount. */
  value: number;
  format?: (n: number) => string;
  delta?: number; // percentage; sign drives tone
  deltaLabel?: string;
}

// Mirrors Figma "KPI Tile": Sora SemiBold 36 tabular value, delta pill.
export function KpiTile({ label, value, format = (n) => n.toLocaleString("en-IN"), delta, deltaLabel = "vs yesterday", className, ...props }: KpiTileProps) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 80, damping: 20 });
  const text = useTransform(spring, (v) => format(Math.round(v)));
  React.useEffect(() => { mv.set(value); }, [value, mv]);
  const up = (delta ?? 0) >= 0;
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-5", className)} {...props}>
      <span className="text-sm font-medium text-muted">{label}</span>
      <motion.span className="font-display text-4xl font-semibold text-foreground font-tabular">{text}</motion.span>
      {delta !== undefined && (
        <div className="flex items-center gap-1.5 text-xs">
          <Badge tone={up ? "success-soft" : "danger-soft"} className="font-semibold">
            {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </Badge>
          <span className="text-subtle">{deltaLabel}</span>
        </div>
      )}
    </div>
  );
}
