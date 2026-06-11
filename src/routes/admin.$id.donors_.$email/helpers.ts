export const SUB_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export const sub_color = (idx: number) => SUB_COLORS[idx % SUB_COLORS.length];

/** "May" if same year, "May 2025" if not */
export function since_label(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const month = d.toLocaleString("en-US", { month: "short" });
  return d.getFullYear() === now.getFullYear()
    ? month
    : `${month} ${d.getFullYear()}`;
}
