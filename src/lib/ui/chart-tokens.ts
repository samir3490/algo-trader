/**
 * Chart colors aligned with globals.css design tokens.
 * Prefer CSS vars so Recharts / SVG stay in sync with the theme.
 */
export const chartTokens = {
  profit: "var(--color-profit)",
  loss: "var(--color-loss)",
  accent: "var(--color-accent)",
  axis: "var(--color-chart-axis)",
  muted: "var(--color-chart-muted)",
  grid: "var(--color-chart-grid)",
  bgElevated: "var(--color-bg-elevated)",
  border: "var(--color-border)",
  textPrimary: "var(--color-text-primary)",
  textSecondary: "var(--color-text-secondary)",
  textTertiary: "var(--color-text-tertiary)",
  modePaper: "var(--color-mode-paper)",
  modeLive: "var(--color-mode-live)",
} as const;

export type ChartTone = "profit" | "loss" | "accent" | "muted";

export function chartStroke(tone: ChartTone): string {
  return chartTokens[tone];
}
