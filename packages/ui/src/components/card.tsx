import * as React from "react";
import { cn } from "../lib/cn";

// Mirrors Figma "Card": surface-raised, radius/xl, Elevation/1, 20px padding.
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("rounded-xl border border-border bg-surface-raised p-5 shadow-1", className)} {...props} />
));
Card.displayName = "Card";

export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn("text-md font-semibold text-foreground", className)} {...props} />
);
export const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-sm text-muted", className)} {...props} />
);
