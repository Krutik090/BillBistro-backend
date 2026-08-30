// QR menu shell — mobile-first, brandable per tenant. Static sample menu, no ordering logic yet.
import { Search } from "lucide-react";
import { Badge, Button, LogoMark, ThemeToggle } from "@billbistro/ui";

const sections = [
  { name: "Starters", items: [["Paneer Tikka", 320, "Char-grilled cottage cheese, mint chutney"], ["Chicken 65", 360, "Crispy, spicy, curry-leaf tempered"]] },
  { name: "Mains", items: [["Butter Chicken", 420, "Tomato-cashew gravy, slow simmered"], ["Dal Makhani", 280, "Overnight black lentils"]] },
  { name: "Breads", items: [["Garlic Naan", 70, ""], ["Tandoori Roti", 40, ""]] },
] as const;

export default function MenuPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur">
        <LogoMark size={36} />
        <div className="flex-1 leading-tight">
          <div className="font-display font-semibold">Spice Route</div>
          <div className="text-xs text-muted">Table 4 · Koramangala</div>
        </div>
        <Badge tone="success">Open</Badge>
        <ThemeToggle />
      </header>
      <div className="px-4 pt-4">
        <label className="flex h-12 items-center gap-2.5 rounded-md border border-border bg-surface px-3.5 text-subtle">
          <Search size={16} /><input className="w-full bg-transparent text-md text-foreground outline-none placeholder:text-subtle" placeholder="Search the menu" />
        </label>
      </div>
      <nav className="flex gap-2 overflow-x-auto px-4 py-3">
        {sections.map((s, i) => <span key={s.name} className={i === 0 ? "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" : "rounded-full border border-border px-4 py-2 text-sm font-semibold"}>{s.name}</span>)}
      </nav>
      <main className="flex flex-1 flex-col gap-6 px-4 pb-28">
        {sections.map((s) => (
          <section key={s.name} className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-semibold">{s.name}</h2>
            {s.items.map(([name, price, desc]) => (
              <div key={name} className="flex gap-3 rounded-xl border border-border bg-surface-raised p-3.5">
                <div className="flex-1">
                  <div className="font-semibold">{name}</div>
                  {desc && <p className="text-sm text-muted">{desc}</p>}
                  <div className="mt-1 font-mono text-sm font-medium text-primary">₹{price}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="size-16 rounded-md bg-surface-overlay" />
                  <Button size="sm" variant="secondary">Add</Button>
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>
      <footer className="fixed inset-x-0 bottom-0 mx-auto max-w-md p-4">
        <Button size="lg" variant="glow" className="w-full justify-between px-5"><span>3 items</span><span>View order · ₹1,100</span></Button>
      </footer>
    </div>
  );
}
