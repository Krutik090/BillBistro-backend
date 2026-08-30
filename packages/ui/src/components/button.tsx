"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

// Mirrors Figma "Button" (Variant × Size). Large = 56px POS touch target.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold select-none transition-[background-color,transform,box-shadow] duration-150 ease-standard active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-1",
        secondary: "bg-surface-overlay text-foreground border border-border hover:border-border-strong",
        ghost: "text-foreground hover:bg-surface-overlay",
        danger: "bg-danger text-neutral-0 hover:brightness-110",
        glow: "bg-primary text-primary-foreground shadow-glow hover:bg-primary-hover",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-md",
        lg: "h-touch px-7 text-lg rounded-lg",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
export { buttonVariants };
