import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

// Mirrors Figma "Badge" tones. Success=Paid, Warning=Pending, Danger=Void, Info=Online, Brand=VIP.
const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-none", {
  variants: {
    tone: {
      neutral: "bg-surface-overlay text-muted",
      success: "bg-success text-neutral-950",
      warning: "bg-warning text-neutral-950",
      danger: "bg-danger text-neutral-950",
      info: "bg-info text-neutral-950",
      brand: "bg-primary text-primary-foreground",
      "success-soft": "bg-success/15 text-success",
      "danger-soft": "bg-danger/15 text-danger",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export const Badge = ({ className, tone, ...props }: BadgeProps) => <span className={cn(badgeVariants({ tone }), className)} {...props} />;
