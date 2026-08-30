// Motion tokens (mirror packages/config/tokens/tokens.json -> motion.*)
export const spring = { type: "spring", stiffness: 420, damping: 32 } as const;
export const duration = { instant: 0.08, fast: 0.15, base: 0.22, slow: 0.4 } as const;
export const easeStandard = [0.2, 0, 0, 1] as const;
export const easeEmphasized = [0.3, 0, 0, 1] as const;
