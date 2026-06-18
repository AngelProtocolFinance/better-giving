import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { useFilter } from "@ark-ui/react/locale";
import { Portal } from "@ark-ui/react/portal";
import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { unpack } from "#/helpers/unpack";

interface Classes {
  container?: string;
  input?: string;
}

interface ITokenCombobox<T> {
  disabled?: boolean;
  value: T;
  on_change: (v: T) => void;
  on_search: (q: string, signal: AbortSignal) => Promise<T[]>;
  item_key: (v: T) => string;
  item_label: (v: T) => string;
  input_placeholder: string;
  btn_disp: (open: boolean) => ReactElement;
  opt_disp: (v: T) => ReactElement;
  opts_styles?: Record<string, string | undefined>;
  classes?: Classes | string;
}

/** sync (pre-loaded) variant — no async search, uses built-in filter */
interface ITokenComboboxSync<T> {
  disabled?: boolean;
  value: T;
  on_change: (v: T) => void;
  items: T[];
  item_key: (v: T) => string;
  item_label: (v: T) => string;
  input_placeholder: string;
  btn_disp: (open: boolean) => ReactElement;
  opt_disp: (v: T) => ReactElement;
  opts_styles?: Record<string, string | undefined>;
  classes?: Classes | string;
}

type SearchState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; msg: string }
  | { status: "ok"; data: T[] };

const popup_classes =
  "w-56 border p-1 max-h-60 overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-(--form-primary) scrollbar-track-(--form-secondary) rounded bg-muted shadow-lg focus:outline-hidden";

const positioning = { gutter: 8, placement: "bottom-start" as const };

function results_of<T>(state: SearchState<T>): T[] {
  return state.status === "ok" ? state.data : [];
}

export function TokenCombobox<T>(props: ITokenCombobox<T>) {
  const s = unpack(props.classes);

  const [search, set_search] = useState<SearchState<T>>({ status: "idle" });
  const [search_q, set_search_q] = useState("");
  const [is_open, set_is_open] = useState(false);
  const abort_ref = useRef<AbortController | null>(null);

  const search_results = results_of(search);

  // keep selected value in items list so it remains visible/resolvable
  const items = useMemo(() => {
    const key = props.item_key(props.value);
    if (!key) return search_results;
    if (search_results.some((r) => props.item_key(r) === key)) {
      return search_results;
    }
    return [...search_results, props.value];
  }, [search_results, props.value, props.item_key]);

  const collection = useMemo(
    () =>
      createListCollection({
        items,
        itemToValue: (v) => props.item_key(v),
        itemToString: (v) => props.item_label(v),
      }),
    [items, props.item_key, props.item_label]
  );

  function fire_search(q: string) {
    const controller = new AbortController();
    abort_ref.current?.abort();
    abort_ref.current = controller;
    set_search({ status: "loading" });

    props
      .on_search(q, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        set_search({ status: "ok", data });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        set_search({ status: "error", msg: "Failed to load options" });
      });
  }

  function get_status() {
    if (search.status === "loading") return "Searching…";
    if (search.status === "error") return search.msg;
    const trimmed = search_q.trim();
    if (trimmed === "" || search_results.length > 0) return null;
    return `${trimmed} not found`;
  }

  const selected_key = props.item_key(props.value);

  return (
    <Combobox.Root<T>
      className="flex"
      collection={collection}
      disabled={props.disabled}
      value={selected_key ? [selected_key] : []}
      onValueChange={(e) => {
        const next = e.items[0];
        if (next) props.on_change(next);
      }}
      onOpenChange={(e) => {
        set_is_open(e.open);
        // load initial results on open (matches old useSWR-on-mount behavior)
        if (e.open) fire_search("");
      }}
      onExitComplete={() => {
        if (!props.value) return;
        const key = props.item_key(props.value);
        if (key) set_search({ status: "ok", data: [props.value] });
      }}
      onInputValueChange={(e) => {
        const next_q = e.inputValue;
        set_search_q(next_q);

        if (next_q === "") {
          const key = props.item_key(props.value);
          set_search(
            key ? { status: "ok", data: [props.value] } : { status: "idle" }
          );
          return;
        }

        if (e.reason === "item-select") return;

        fire_search(next_q);
      }}
      positioning={positioning}
      openOnClick
    >
      <Combobox.Control className={`${s.container} relative flex h-full`}>
        <Combobox.Input
          placeholder={props.input_placeholder}
          className="w-full text-left text-sm focus:outline-hidden bg-transparent px-4"
        />
        <Combobox.Trigger className="absolute right-4 top-1/2 -translate-y-1/2">
          {props.btn_disp(is_open)}
        </Combobox.Trigger>
      </Combobox.Control>

      <Portal>
        <Combobox.Positioner>
          <Combobox.Content style={props.opts_styles} className={popup_classes}>
            {get_status() ? (
              <p className="p-2 text-sm text-muted-fg">{get_status()}</p>
            ) : null}
            {items.map((opt) => props.opt_disp(opt))}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}

/** sync variant for pre-loaded option lists (e.g. stripe currencies) */
export function TokenComboboxSync<T>(props: ITokenComboboxSync<T>) {
  const s = unpack(props.classes);
  const { contains } = useFilter({ sensitivity: "base" });
  const [is_open, set_is_open] = useState(false);

  // controlled inputValue: tracks the selected label, or the user's typed query
  const display = props.value ? props.item_label(props.value) : "";
  const [input_value, set_input_value] = useState(display);
  useEffect(() => {
    set_input_value(display);
  }, [display]);

  const is_search = input_value !== "" && input_value !== display;
  const filter_q = is_search ? input_value : "";

  // show first 10 when no query, otherwise filter
  const visible = useMemo(() => {
    if (!filter_q) return props.items.slice(0, 10);
    return props.items.filter((v) => contains(props.item_label(v), filter_q));
  }, [props.items, filter_q, contains, props.item_label]);

  const collection = useMemo(
    () =>
      createListCollection({
        items: visible,
        itemToValue: (v) => props.item_key(v),
        itemToString: (v) => props.item_label(v),
      }),
    [visible, props.item_key, props.item_label]
  );

  const selected_key = props.item_key(props.value);

  return (
    <Combobox.Root<T>
      className="flex"
      collection={collection}
      disabled={props.disabled}
      value={selected_key ? [selected_key] : []}
      onValueChange={(e) => {
        const next = e.items[0];
        if (next) props.on_change(next);
      }}
      inputValue={input_value}
      onOpenChange={(e) => set_is_open(e.open)}
      onInputValueChange={(e) => {
        // only react to typing; useEffect syncs input from selected display
        if (e.reason === "input-change") set_input_value(e.inputValue);
      }}
      positioning={positioning}
      openOnClick
    >
      <Combobox.Control className={`${s.container} relative flex h-full`}>
        <Combobox.Input
          placeholder={props.input_placeholder}
          className="w-full text-left text-sm focus:outline-hidden bg-transparent px-4"
        />
        <Combobox.Trigger className="absolute right-4 top-1/2 -translate-y-1/2">
          {props.btn_disp(is_open)}
        </Combobox.Trigger>
      </Combobox.Control>

      <Portal>
        <Combobox.Positioner>
          <Combobox.Content style={props.opts_styles} className={popup_classes}>
            {visible.length === 0 ? (
              <p className="p-2 text-sm text-muted-fg">{filter_q} not found</p>
            ) : (
              visible.map((opt) => props.opt_disp(opt))
            )}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}
