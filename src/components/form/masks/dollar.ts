const fmt = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

export function mask(num: number): string {
  if (!Number.isFinite(num) || num < 0) return "$ 0";
  return `$ ${fmt.format(num)}`;
}

/** format raw digit string with prefix + thousand separators */
export function format(digits: string): string {
  if (!digits) return "";
  const num = Number.parseInt(digits, 10);
  if (Number.isNaN(num)) return "";
  if (num === 0) return "$ 0";
  return `$ ${fmt.format(num)}`;
}

export function unmask(masked: string): string {
  return masked.replace(/[^0-9]/g, "");
}
