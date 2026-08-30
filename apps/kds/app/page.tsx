"use client";
// KDS shell — per Figma "Hero / KDS". High-contrast, color-coded timers, glanceable. Static sample tickets.
import * as React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { ThemeToggle, cn, spring } from "@billbistro/ui";

type Status = "late" | "warn" | "ok";
const tickets: { id: string; table: string; time: string; status: Status; items: [string, boolean][] }[] = [
  { id: "#1042", table: "Table 4", time: "12:40", status: "late", items: [["2× Butter Chicken", true], ["3× Garlic Naan", true], ["1× Dal Makhani", false], ["2× Sweet Lassi", false]] },
  { id: "#1043", table: "Table 7", time: "08:15", status: "warn", items: [["1× Paneer Tikka", true], ["3× Lassi", false]] },
  { id: "#1044", table: "Online · Swiggy", time: "03:02", status: "ok", items: [["1× Veg Biryani", false], ["1× Raita", false]] },
  { id: "#1045", table: "Table 2", time: "06:48", status: "warn", items: [["2× Chicken 65", true], ["1× Tandoori Roti", false], ["1× Masala Papad", false]] },
  { id: "#1046", table: "Table 9", time: "01:10", status: "ok", items: [["1× Mutton Rogan Josh", false], ["2× Naan", false]] },
  { id: "#1047", table: "Takeaway", time: "00:35", status: "ok", items: [["2× Gulab Jamun", false]] },
  { id: "#1048", table: "Table 11", time: "14:05", status: "late", items: [["1× Veg Manchurian", true], ["1× Fried Rice", true], ["1× Coke", false]] },
];
const head: Record<Status, string> = { late: "bg-danger", warn: "bg-warning", ok: "bg-success" };

export default function KdsPage() {
  const [station, setStation] = React.useState("All");
  return (
    <div className="flex h-dvh flex-col bg-neutral-950 text-foreground">
      <header className="flex items-center justify-between border-b border-border bg-surface px-8 py-5">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-3xl font-bold tracking-tight">KITCHEN · MAIN LINE</h1>
          <span className="rounded-full bg-surface-overlay px-3.5 py-1.5 text-lg font-semibold text-warning">7 active · 2 late</span>
        </div>
        <div className="flex items-center gap-3">
          {["All", "Tandoor", "Curry", "Bar"].map((s) => (
            <button key={s} onClick={() => setStation(s)} className={cn("relative h-12 rounded-lg px-5 text-lg font-semibold", s === station ? "text-primary-foreground" : "bg-surface-overlay")}>
              {s === station && <motion.span layoutId="station" className="absolute inset-0 rounded-lg bg-primary" transition={spring} />}
              <span className="relative">{s}</span>
            </button>
          ))}
          <span className="ml-3 font-mono text-3xl font-medium text-muted font-tabular">19:42</span>
          <ThemeToggle />
        </div>
      </header>
      <main className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(352px,1fr))] gap-5 overflow-y-auto p-6">
        {tickets.map((t) => (
          <motion.article key={t.id} layout className={cn("flex flex-col overflow-hidden rounded-2xl border bg-surface-raised", t.status === "late" ? "border-2 border-danger" : "border-border")}>
            <div className={cn("flex items-center justify-between px-4.5 py-3.5 text-neutral-950", head[t.status])}>
              <div><div className="font-display text-xl font-bold">{t.table}</div><div className="text-sm font-medium text-neutral-900">{t.id} · dine-in</div></div>
              <span className="font-mono text-3xl font-medium font-tabular">{t.time}</span>
            </div>
            <ul className="px-4.5 py-2">
              {t.items.map(([name, done]) => (
                <li key={name} className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
                  <span className={cn("flex size-7 items-center justify-center rounded-md", done ? "bg-success text-neutral-950" : "border border-border-strong")}>{done && <Check size={16} strokeWidth={3} />}</span>
                  <span className={cn("text-kds font-semibold", done ? "text-subtle line-through" : "text-foreground")}>{name}</span>
                </li>
              ))}
            </ul>
            <button className="bg-surface-overlay py-4 text-xl font-bold hover:bg-primary hover:text-primary-foreground">BUMP →</button>
          </motion.article>
        ))}
      </main>
    </div>
  );
}
