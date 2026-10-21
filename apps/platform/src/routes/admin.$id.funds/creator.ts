export function fund_creator(raw: string | null) {
  return raw === "ours" || raw === "others" ? raw : undefined;
}
