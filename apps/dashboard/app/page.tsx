"use client";
// Owner dashboard shell — per Figma "Hero / Dashboard". Static sample data, no business logic yet.
import Link from "next/link";
import { LayoutDashboard, Flame, UtensilsCrossed, Boxes, Users, Heart, BarChart3, Settings } from "lucide-react";
import { AppShell, Button, Card, CardTitle, KpiTile, cn } from "@billbistro/ui";

const nav = [
  { label: "Overview", href: "/", icon: <LayoutDashboard size={16} /> },
  { label: "Live orders", href: "/orders", icon: <Flame size={16} /> },
  { label: "Menu & pricing", href: "/menu", icon: <UtensilsCrossed size={16} /> },
  { label: "Inventory", href: "/inventory", icon: <Boxes size={16} /> },
  { label: "Staff", href: "/staff", icon: <Users size={16} /> },
  { label: "Customers", href: "/customers", icon: <Heart size={16} /> },
  { label: "Reports", href: "/reports", icon: <BarChart3 size={16} /> },
  { label: "Settings", href: "/settings", icon: <Settings size={16} /> },
];
const hours = [12, 18, 30, 52, 70, 64, 40, 26, 22, 38, 74, 96, 88, 58];
const top = [["Butter Chicken", 42, 100], ["Garlic Naan", 38, 90], ["Paneer Tikka", 27, 64], ["Veg Biryani", 21, 50], ["Sweet Lassi", 19, 45]] as const;
const live = [["T4 · #1042", "Cooking", "text-warning"], ["T7 · #1043", "Served", "text-success"], ["Online · #1044", "New", "text-info"], ["T2 · #1045", "Bill requested", "text-primary"], ["T9 · #1046", "Cooking", "text-warning"]] as const;

export default function DashboardPage() {
  return (
    <AppShell app="Dashboard" tenant="Spice Route · Koramangala" nav={nav} activeHref="/" variant="sidebar" Link={Link}>
      <div className="flex flex-col gap-5 p-7">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold">Good evening, Priya</h1>
            <p className="text-sm text-muted">Saturday, 30 Aug · 42 covers so far · live</p>
          </div>
          <div className="flex rounded-md border border-border bg-surface p-1 text-sm">
            {["Today", "Week", "Month", "Custom"].map((r, i) => (
              <button key={r} className={cn("rounded-[7px] px-3.5 py-1.5 font-medium", i === 0 ? "bg-surface-overlay text-foreground" : "text-muted hover:text-foreground")}>{r}</button>
            ))}
          </div>
        </header>
        <div className="grid grid-cols-4 gap-4">
          <KpiTile label="Sales today" value={48920} format={(n) => `₹${n.toLocaleString("en-IN")}`} delta={12.4} deltaLabel="vs last Sat" />
          <KpiTile label="Orders" value={136} delta={8.1} deltaLabel="vs last Sat" />
          <KpiTile label="Avg. ticket" value={360} format={(n) => `₹${n}`} delta={-2.3} deltaLabel="vs last Sat" />
          <KpiTile label="Table turns" value={2.4} format={(n) => `${n}×`} delta={0.3} deltaLabel="vs last Sat" />
        </div>
        <div className="grid grid-cols-[1fr_360px] gap-4">
          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between"><CardTitle>Sales by hour</CardTitle><span className="text-xs font-medium text-muted">Peak 8–9 PM · ₹9,140</span></div>
            {/* chart placeholder — Recharts spec lands with dataviz pass; bars use chart tokens */}
            <div className="flex h-64 items-end gap-2.5">
              {hours.map((h, i) => <div key={i} className={cn("flex-1 rounded-md", i === 11 ? "bg-primary" : "bg-surface-overlay")} style={{ height: `${h}%` }} />)}
            </div>
            <div className="flex justify-between text-xs text-subtle">{["9 AM", "12 PM", "3 PM", "6 PM", "9 PM", "11 PM"].map((t) => <span key={t}>{t}</span>)}</div>
          </Card>
          <Card className="flex flex-col gap-3">
            <CardTitle>Top items</CardTitle>
            {top.map(([n, c, pct]) => (
              <div key={n} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm"><span className="font-medium">{n}</span><span className="font-mono text-muted">{c}</span></div>
                <div className="h-1.5 rounded-full bg-surface-overlay"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
              </div>
            ))}
          </Card>
        </div>
        <Card className="flex flex-col gap-2.5 py-4">
          <CardTitle>Live orders</CardTitle>
          <div className="grid grid-cols-5 gap-2.5">
            {live.map(([t, s, c]) => (
              <div key={t} className="rounded-lg border border-border bg-surface px-3.5 py-3"><div className="text-sm font-semibold">{t}</div><div className={cn("text-xs font-medium", c)}>{s}</div></div>
            ))}
          </div>
        </Card>
        <div><Button variant="secondary">Export report</Button></div>
      </div>
    </AppShell>
  );
}
