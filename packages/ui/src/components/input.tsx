"use client";
import * as React from "react";
import { cn } from "../lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  size?: "md" | "lg";
  leading?: React.ReactNode;
}

// Mirrors Figma "Input": 48px field (56px lg for POS), ring = semantic/ring.
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, label, size = "md", leading, id, ...props }, ref) => {
  const inputId = id ?? React.useId();
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-muted">
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-md border border-border bg-surface px-3.5 text-foreground transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
          size === "lg" ? "h-touch rounded-lg text-lg" : "h-12 text-md",
          className,
        )}
      >
        {leading && <span className="text-subtle">{leading}</span>}
        <input ref={ref} id={inputId} className="w-full bg-transparent outline-none placeholder:text-subtle" {...props} />
      </div>
    </div>
  );
});
Input.displayName = "Input";
