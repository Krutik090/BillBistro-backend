// Style-Dictionary-style token build: tokens.json -> dist/tokens.css + dist/tokens.ts
// Run: node packages/config/tokens/build.mjs   (also wired to `pnpm --filter @billbistro/config build`)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(here, "tokens.json"), "utf8"));
const out = join(here, "dist");
mkdirSync(out, { recursive: true });

/** Resolve "{color.neutral.950}" references against the token tree. */
function resolve(value) {
  if (typeof value !== "string") return value;
  return value.replace(/\{([^}]+)\}/g, (_, path) => {
    const node = path.split(".").reduce((n, k) => n?.[k], tokens);
    if (!node || node.$value === undefined) throw new Error(`Unresolved token ref ${path}`);
    return resolve(node.$value);
  });
}

const css = { dark: [], light: [], static: [] };
const ts = {};

const walk = (node, path) => {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("$")) continue;
    const p = [...path, k];
    if (v && typeof v === "object" && "$value" in v) emit(p, v);
    else if (v && typeof v === "object") walk(v, p);
  }
};

const emit = (path, t) => {
  const [group, ...rest] = path;
  const key = rest.join("-");
  const val = t.$value;
  if (group === "semantic") {
    css.dark.push(`  --${key}: ${resolve(val.dark)};`);
    css.light.push(`  --${key}: ${resolve(val.light)};`);
    ts[`semantic.${key}`] = { dark: resolve(val.dark), light: resolve(val.light) };
    return;
  }
  const prefix = { color: "color", font: "font", space: "space", radius: "radius", elevation: "shadow", motion: "motion" }[group] ?? group;
  let cssVal = val;
  if (Array.isArray(val) && group === "font") cssVal = val.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(", ");
  if (Array.isArray(val) && t.$type === "cubicBezier") cssVal = `cubic-bezier(${val.join(", ")})`;
  const name = `--${prefix}-${key}`.replace("--font-size-", "--text-");
  css.static.push(`  ${name}: ${resolve(cssVal)};`);
  ts[path.join(".")] = resolve(cssVal);
};

walk(tokens, []);

const cssText = `/* GENERATED from packages/config/tokens/tokens.json — do not edit by hand */
:root {
${css.static.join("\n")}
}

/* Dark is the native BillBistro mode (matches the Figma "Dark" mode). */
:root, [data-theme="dark"] {
  color-scheme: dark;
${css.dark.join("\n")}
}

[data-theme="light"] {
  color-scheme: light;
${css.light.join("\n")}
}
`;
writeFileSync(join(out, "tokens.css"), cssText);
writeFileSync(
  join(out, "tokens.ts"),
  `// GENERATED from tokens.json — do not edit by hand\nexport const tokens = ${JSON.stringify(ts, null, 2)} as const;\nexport type TokenKey = keyof typeof tokens;\n`,
);
console.log(`tokens: wrote ${css.static.length} static + ${css.dark.length} semantic vars -> ${out}`);
