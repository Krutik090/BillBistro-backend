"use client";
// POS billing shell — layout skeleton per docs/design/hero-pos-billing.png. No business logic yet.
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Receipt, LayoutGrid, ClipboardList, ChefHat, MoreHorizontal, Minus, Plus } from "lucide-react";
import { AppShell, Button, Badge, cn, spring } from "@billbistro/ui";
import { PwaRegister } from "./pwa-register";
import { HealthDot } from "./health-dot";

const nav = [
  { label: "Bill", href: "/", icon: <Receipt size={20} /> },
  { label: "Tables", href: "/tables", icon: <LayoutGrid size={20} /> },
  { label: "Orders", href: "/orders", icon: <ClipboardList size={20} /> },
  { label: "KDS", href: "/kds", icon: <ChefHat size={20} /> },
  { label: "More", href: "/more", icon: <MoreHorizontal size={20} /> },
];
const categories = ["All", "Starters", "Mains", "Breads", "Rice", "Drinks", "Desserts"];
const items = [["Paneer Tikka", 320], ["Chicken 65", 360], ["Veg Manchurian", 260], ["Butter Chicken", 420], ["Dal Makhani", 280], ["Garlic Naan", 70], ["Veg Biryani", 320], ["Mutton Rogan Josh", 520], ["Masala Papad", 60], ["Sweet Lassi", 120], ["Gulab Jamun", 140], ["Tandoori Roti", 40]] as const;
const lines = [[2, "Butter Chicken", 840], [3, "Garlic Naan", 210], [1, "Dal Makhani", 280], [2, "Sweet Lassi", 240]] as const;
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function PosPage() {
  const [cat, setCat] = React.useState("Starters");
  return (
    <AppShell app="POS" nav={nav} activeHref="/" variant="rail" Link={Link}>
      <PwaRegister />
      <div className="flex h-full">
        {/* Catalog */}
        <section className="flex min-w-0 flex-1 flex-col gap-4 p-6">
          <div className="flex items-center gap-3">
            <label className="flex h-touch flex-1 items-center gap-2.5 rounded-lg border border-border bg-surface px-4 text-subtle focus-within:border-ring">
              <Search size={18} />
              <input className="w-full bg-transparent text-md text-foreground outline-none placeholder:text-subtle" placeholder="Search or scan item · press /" />
            </label>
            <div className="flex h-touch items-center rounded-lg bg-surface-overlay px-4 text-sm font-semibold">Table 4 · 3 pax</div>
            <HealthDot />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {categories.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cn("relative h-11 shrink-0 rounded-full border px-4.5 text-sm font-semibold transition-colors", c === cat ? "border-transparent text-primary-foreground" : "border-border bg-surface text-foreground hover:border-border-strong")}>
                {c === cat && <motion.span layoutId="cat" className="absolute inset-0 rounded-full bg-primary" transition={spring} />}
                <span className="relative">{c}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-3 overflow-y-auto">
            {items.map(([name, price]) => (
              <motion.button key={name} whileTap={{ scale: 0.97 }} className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface-raised p-3.5 text-left hover:border-border-strong">
                <div className="h-12 w-full rounded-md bg-surface-overlay" />
                <span className="text-md font-semibold">{name}</span>
                <span className="font-mono text-md font-medium text-primary">{inr(price)}</span>
              </motion.button>
            ))}
          </div>
        </section>
        {/* Bill */}
        <aside className="flex w-[420px] shrink-0 flex-col border-l border-border bg-surface">
          <div className="flex items-center justify-between px-5 pt-5 pb-4">
            <h2 className="font-display text-xl font-semibold">Bill #1042</h2>
            <Badge className="text-success">KOT sent · 2 min</Badge>
          </div>
          <ul className="flex-1 overflow-y-auto px-5">
            {lines.map(([qty, name, total]) => (
              <li key={name} className="flex items-center gap-3 border-b border-border py-3.5">
                <div className="flex h-9 w-24 items-center justify-between rounded-md bg-surface-overlay px-3">
                  <Minus size={14} className="text-muted" /><span className="text-md font-semibold">{qty}</span><Plus size={14} className="text-primary" />
                </div>
                <span className="flex-1 text-md font-medium">{name}</span>
                <span className="font-mono text-md font-medium">{inr(total)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 bg-surface-raised px-5 py-4 text-sm">
            <Row k="Subtotal" v={inr(1570)} /><Row k="GST 5%" v="₹78.50" /><Row k="Discount" v="−₹100" />
            <div className="flex items-center justify-between pt-1"><span className="text-lg font-semibold">Total</span><span className="font-display text-3xl font-semibold font-tabular">₹1,548.50</span></div>
          </div>
          <div className="flex flex-col gap-2.5 px-5 pt-3 pb-5">
            <div className="grid grid-cols-3 gap-2.5">
              <Button variant="secondary" size="lg">Hold</Button><Button variant="secondary" size="lg">Split</Button><Button variant="secondary" size="lg">Discount</Button>
            </div>
            <Button variant="glow" size="lg" className="h-16 text-lg">Charge ₹1,548.50 · UPI / Cash / Card</Button>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-center justify-between text-muted"><span>{k}</span><span className="font-mono text-foreground">{v}</span></div>
);
