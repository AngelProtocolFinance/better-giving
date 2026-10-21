import { createHmac, timingSafeEqual } from "node:crypto";

export type ListCursor = { v: string; id: string };

const secret = () => process.env.CONNECTOR_CURSOR_SECRET || "connector-cursor";

/** Signed keyset cursor. `order` is part of the payload so a campaigns cursor cannot page gifts. */
export function encode_list_cursor(
  order: string,
  v: string,
  id: string
): string {
  const body = Buffer.from(
    JSON.stringify({ o: order, v, i: id }),
    "utf8"
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function decode_list_cursor(
  token: string,
  order: string
): ListCursor | null {
  if (token.length > 512) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret())
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as { o?: unknown; v?: unknown; i?: unknown };
  if (row.o !== order || typeof row.v !== "string" || typeof row.i !== "string")
    return null;
  if (!row.v || !row.i || Number.isNaN(Date.parse(row.v))) return null;
  return { v: row.v, id: row.i };
}
