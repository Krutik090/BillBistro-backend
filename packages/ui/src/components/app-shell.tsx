"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "../lib/cn";
import { ThemeToggle } from "./theme-toggle";

export interface NavItem { label: string; href: string; icon?: React.ReactNode; }

export interface AppShellProps {
  /** App name shown next to the logo mark. */
  app: string;
  tenant?: string;
  nav: NavItem[];
  activeHref: string;
  /** "rail" = 72px icon rail (POS/KDS), "sidebar" = 240px (dashboard). */
  variant?: "rail" | "sidebar";
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  /** Link component (pass next/link); defaults to <a>. */
  Link?: React.ComponentType<React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>;
}

const DefaultLink = (p: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a {...p} />;

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center rounded-[12px] bg-primary font-display font-bold text-primary-foreground shadow-glow" style={{ width: size, height: size, fontSize: size / 2 }}>
      B
    </div>
  );
}

export function AppShell({ app, tenant, nav, activeHref, variant = "rail", headerRight, children, Link = DefaultLink }: AppShellProps) {
  const rail = variant === "rail";
  return (
    <div className="flex h-dvh w-full bg-background text-foreground">
      <aside className={cn("flex shrink-0 flex-col border-r border-border bg-surface", rail ? "w-[72px] items-center px-3 py-4" : "w-60 px-4 py-5")}>
        <div className={cn("mb-4 flex items-center gap-2.5", rail && "justify-center")}>
          <LogoMark size={rail ? 40 : 32} />
          {!rail && (
            <div className="leading-tight">
              <div className="font-display font-semibold">BillBistro</div>
              {tenant && <div className="text-xs text-muted">{tenant}</div>}
            </div>
          )}
        </div>
        <nav className={cn("flex flex-col gap-1", rail && "w-full")}>
          {nav.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center rounded-md transition-colors",
                  rail ? "flex-col gap-1 py-2.5 text-[10px]" : "h-10 gap-2.5 px-3 text-sm",
                  active ? "font-semibold text-foreground" : "font-medium text-muted hover:text-foreground",
                )}
              >
                {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-md bg-surface-overlay" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
                <span className={cn("relative", active ? "text-primary" : "text-subtle")}>{item.icon}</span>
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex justify-center">
          <ThemeToggle />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {headerRight !== undefined && (
          <header className="flex h-14 items-center justify-between border-b border-border px-6">
            <span className="text-sm font-medium text-muted">{app}{tenant ? ` · ${tenant}` : ""}</span>
            <div>{headerRight}</div>
          </header>
        )}
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
