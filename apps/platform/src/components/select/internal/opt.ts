import { type ReactNode, useMemo } from "react";
import type { Opt } from "../types";

/**
 * resolves `Opt<T>`'s optional readers to total functions.
 *
 * the identity defaults are only correct for `T extends string` — a non-string
 * option type must supply `item_key` and `item_text`, which typescript can't force from
 * here without splitting the interface in two.
 */
export function use_opt<T>(o: Opt<T>) {
  return useMemo(() => {
    const text = o.item_text ?? ((v: T) => String(v));
    return {
      key: o.item_key ?? ((v: T) => String(v)),
      text,
      render: o.render ?? ((v: T): ReactNode => text(v)),
    };
  }, [o.item_key, o.item_text, o.render]);
}
