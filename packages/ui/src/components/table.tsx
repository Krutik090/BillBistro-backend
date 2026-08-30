import * as React from "react";
import { cn } from "../lib/cn";

// Mirrors Figma "Table": 40px uppercase header, 52px zebra rows, numeric cells mono + right-aligned.
export const Table = ({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-x-auto rounded-lg border border-border bg-surface-raised">
    <table className={cn("w-full border-collapse text-sm", className)} {...props} />
  </div>
);
export const THead = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className="bg-surface-overlay" {...props} />;
export const TBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className="[&>tr:nth-child(even)]:bg-surface" {...props} />;
export const TR = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("border-t border-border first:border-t-0", className)} {...props} />
);
export const TH = ({ className, numeric, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) => (
  <th className={cn("h-10 px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted", numeric && "text-right", className)} {...props} />
);
export const TD = ({ className, numeric, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) => (
  <td className={cn("h-13 px-4 py-3 text-foreground", numeric && "text-right font-mono font-medium font-tabular", className)} {...props} />
);
