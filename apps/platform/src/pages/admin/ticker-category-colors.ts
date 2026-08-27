import type { TickerCategory } from "@/nav/interfaces";

/* a categorical legend, not semantic tokens: crypto and commodities carry the
   assets' own identity colors (bitcoin orange, gold), so the whole set stays off
   the design palette rather than repointing four of its six entries and leaving
   the legend reading in two languages. */
export const category_colors: Record<TickerCategory | "other", string> = {
  equities: "#3b82f6",
  fixed_income: "#6b7280",
  crypto: "#f7931a",
  commodities: "#ffd700",
  cash: "#22c55e",
  other: "#64748b",
};
