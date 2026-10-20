import { createElement } from "react";

/** the refusal `endowUpdate` returns; a success payload has no `error` to show */
export function save_error(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  if (!("ok" in data) || data.ok !== false) return null;
  if (!("error" in data) || typeof data.error !== "string") return null;
  return data.error;
}

/** stays mounted while empty so the refusal is a change in a live region */
export function SaveAlert({ data }: { data: unknown }) {
  const error = save_error(data);
  return createElement(
    "p",
    {
      role: "alert",
      className: `text-sm text-destructive-subtle-fg${error ? " mb-2" : ""}`,
    },
    error
  );
}
