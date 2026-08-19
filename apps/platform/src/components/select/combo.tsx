import { Combobox } from "@ark-ui/react/combobox";
import { useFilter } from "@ark-ui/react/locale";
import { X } from "lucide-react";
import { type ReactNode, type Ref, useMemo, useRef, useState } from "react";
import { use_dialog_container } from "../use-dialog-container";
import {
  adornment_start_cls,
  drawer_trigger_cls,
  RESULT_LIMIT,
} from "./classes";
import { FieldFrame } from "./internal/field-frame";
import { use_opt } from "./internal/opt";
import { Options } from "./internal/options";
import { Popup } from "./internal/popup";
import { Status } from "./internal/status";
import { use_collection } from "./internal/use-collection";
import { SelectedInputSync } from "./internal/use-selected-input";
import { use_source } from "./internal/use-source";
import type { FieldProps, Opt, SyncSource } from "./types";

export interface Props<T> extends FieldProps, Opt<T> {
  value: T | undefined;
  /** `undefined` when the value is cleared — the caller decides what empty is */
  on_change: (v: T | undefined) => void;
  options: SyncSource<T>;
  /** rows rendered from the filtered list; default `RESULT_LIMIT` */
  limit?: number;
  /** matcher over `item_text(v)`; default `useFilter({ sensitivity: "base" }).contains` */
  filter?: (text: string, q: string) => boolean;
  /** the thing in the control: a flag, a spinner, the drawer chevron */
  adornment?: (open: boolean, state: "idle" | "loading" | "error") => ReactNode;
  /** start = country flag, end = drawer chevron. default end */
  adornment_side?: "start" | "end";
  /** offer an X that empties the field */
  clearable?: boolean;
  on_reset?: () => void;
  ref?: Ref<HTMLInputElement>;
}

/**
 * single-select over the combobox machine — text entry, filtering, one value.
 *
 * `inputValue` is deliberately NOT controlled: that is what lets zag keep the
 * displayed text in step with an externally-changed value (RHF `reset()`), and
 * `internal/use-selected-input` documents the whole contract.
 */
export function Combo<T>({ ref, ...p }: Props<T>) {
  const ctrl_ref = useRef<HTMLDivElement>(null);
  const dialog = use_dialog_container(ctrl_ref);
  const { contains } = useFilter({ sensitivity: "base" });
  const opt = use_opt(p);
  const src = use_source(p.options);
  const [query, set_query] = useState("");

  const limit = p.limit ?? RESULT_LIMIT;
  const match = p.filter ?? contains;

  const filtered = useMemo(() => {
    const base = query
      ? src.items.filter((v) => match(opt.text(v), query))
      : src.items;
    return base.slice(0, limit);
  }, [src.items, query, match, opt, limit]);

  const selected = useMemo(() => (p.value == null ? [] : [p.value]), [p.value]);

  const { rows, collection } = use_collection({
    items: filtered,
    selected,
    key: opt.key,
    label: opt.text,
  });

  // a query source with nothing in it yet has nothing to offer; leaving the
  // control open would present an empty list as if it were the answer.
  const disabled = p.disabled || src.loading || !!src.error;
  const side = p.adornment_side ?? "end";
  const has_clear = !!p.clearable && p.value != null;

  return (
    <FieldFrame
      label={p.label}
      required={p.required}
      error={p.error}
      disabled={disabled}
      classes={{ container: p.classes?.container, label: p.classes?.label }}
    >
      <Combobox.Root<T>
        collection={collection}
        disabled={disabled}
        invalid={!!p.error}
        value={p.value == null ? [] : [opt.key(p.value)]}
        onValueChange={(e) => p.on_change(e.items[0])}
        // only typing narrows the list. every other reason zag reports —
        // item-select, clear-trigger, the sync below — means the text now
        // describes the value, not a search.
        onInputValueChange={(e) =>
          set_query(e.reason === "input-change" ? e.inputValue : "")
        }
        positioning={{ placement: "bottom-start", gutter: 8 }}
        openOnClick
      >
        <SelectedInputSync />
        <Combobox.Control
          ref={ctrl_ref}
          className={`relative ${p.classes?.control ?? ""}`}
        >
          <Combobox.Input
            ref={ref}
            placeholder={p.placeholder}
            aria-required={p.required || undefined}
            spellCheck={false}
            className={`field-input w-full h-full ${
              side === "start" && p.adornment ? "pl-12" : ""
            } ${side === "end" && p.adornment ? "pr-12" : ""} ${
              has_clear ? "pr-12" : ""
            }`}
          />
          {p.adornment && (
            <Combobox.Trigger
              className={
                side === "start" ? adornment_start_cls : drawer_trigger_cls
              }
            >
              <Combobox.Context>
                {(api) => p.adornment?.(api.open, src.state)}
              </Combobox.Context>
            </Combobox.Trigger>
          )}
          {has_clear && (
            <Combobox.Context>
              {(api) => (
                <Combobox.ClearTrigger
                  disabled={disabled}
                  onClick={() => {
                    p.on_reset?.();
                    // ClearTrigger clears + focuses the input; reopen so the
                    // field isn't left focused over a closed empty list
                    queueMicrotask(() => api.setOpen(true));
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center disabled:text-muted-fg text-destructive hover:text-destructive active:text-destructive"
                >
                  <X size={16} />
                </Combobox.ClearTrigger>
              )}
            </Combobox.Context>
          )}
        </Combobox.Control>

        <Popup
          parts={{
            Positioner: Combobox.Positioner,
            Content: Combobox.Content,
          }}
          container={dialog}
          vars={p.popup_vars}
          classes={p.classes?.options}
        >
          <Options
            items={rows}
            item_key={opt.key}
            render={opt.render}
            classes={p.classes?.option}
          />
          <Status
            loading={src.loading}
            error={src.error}
            query={query}
            count={rows.length}
          />
        </Popup>
      </Combobox.Root>
    </FieldFrame>
  );
}
