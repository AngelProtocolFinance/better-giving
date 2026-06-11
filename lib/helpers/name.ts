export const to_full = (first_name?: string, last_name?: string): string =>
  [first_name, last_name].filter(Boolean).join(" ").trim() || "Anonymous";

export const from_full = (
  full_name: string | undefined
): { fn?: string; ln?: string } => {
  const parts = full_name?.trim().split(" ");
  const fn = parts?.shift();
  const ln = parts?.join(" ") || undefined;
  return { fn, ln };
};
