import { Combobox } from "@base-ui/react/combobox";
import { type ReactElement, useMemo, useRef, useState } from "react";
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
  "w-56 border p-1 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-(--form-primary) scrollbar-track-(--form-secondary) rounded bg-muted shadow-lg focus:outline-hidden";

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

  // keep selected value in items list so it remains visible
  const items = useMemo(() => {
    const key = props.item_key(props.value);
    if (!key) return search_results;
    if (search_results.some((r) => props.item_key(r) === key)) {
      return search_results;
    }
    return [...search_results, props.value];
  }, [search_results, props.value, props.item_key]);

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

  return (
    <Combobox.Root<T>
      items={items}
      itemToStringLabel={(v) => props.item_label(v)}
      isItemEqualToValue={(a, b) => props.item_key(a) === props.item_key(b)}
      filter={null}
      disabled={props.disabled}
      value={props.value}
      onValueChange={(v) => v && props.on_change(v)}
      onOpenChange={(open) => {
        set_is_open(open);
        // load initial results on open (matches old useSWR-on-mount behavior)
        if (open) fire_search("");
      }}
      onOpenChangeComplete={(open) => {
        if (!open && props.value) {
          const key = props.item_key(props.value);
          if (key) set_search({ status: "ok", data: [props.value] });
        }
      }}
      onInputValueChange={(next_q, { reason }) => {
        set_search_q(next_q);

        if (next_q === "") {
          const key = props.item_key(props.value);
          set_search(
            key ? { status: "ok", data: [props.value] } : { status: "idle" }
          );
          return;
        }

        if (reason === "item-press") return;

        fire_search(next_q);
      }}
    >
      <fieldset className={`${s.container} relative flex`}>
        <Combobox.Input
          placeholder={props.input_placeholder}
          className="w-full text-left text-sm focus:outline-hidden bg-transparent px-4"
        />
        <Combobox.Trigger className="absolute right-4 top-1/2 -translate-y-1/2">
          {props.btn_disp(is_open)}
        </Combobox.Trigger>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={8} align="start">
            <Combobox.Popup style={props.opts_styles} className={popup_classes}>
              {get_status() ? (
                <p className="p-2 text-sm text-muted-fg">{get_status()}</p>
              ) : null}
              <Combobox.List>
                {items.map((opt) => props.opt_disp(opt))}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </fieldset>
    </Combobox.Root>
  );
}

/** sync variant for pre-loaded option lists (e.g. stripe currencies) */
export function TokenComboboxSync<T>(props: ITokenComboboxSync<T>) {
  const s = unpack(props.classes);
  const { contains } = Combobox.useFilter();
  const [is_open, set_is_open] = useState(false);
  const [input_q, set_input_q] = useState("");

  // show first 10 when no query, otherwise filter
  const visible = useMemo(() => {
    if (!input_q) return props.items.slice(0, 10);
    return props.items.filter((v) => contains(props.item_label(v), input_q));
  }, [props.items, input_q, contains, props.item_label]);

  return (
    <Combobox.Root<T>
      items={visible}
      itemToStringLabel={(v) => props.item_label(v)}
      isItemEqualToValue={(a, b) => props.item_key(a) === props.item_key(b)}
      filter={null}
      disabled={props.disabled}
      value={props.value}
      onValueChange={(v) => v && props.on_change(v)}
      onOpenChange={(open) => {
        set_is_open(open);
        if (open) set_input_q("");
      }}
      onInputValueChange={(next_q) => set_input_q(next_q)}
    >
      <fieldset className={`${s.container} relative flex`}>
        <Combobox.Input
          placeholder={props.input_placeholder}
          className="w-full text-left text-sm focus:outline-hidden bg-transparent px-4"
        />
        <Combobox.Trigger className="absolute right-4 top-1/2 -translate-y-1/2">
          {props.btn_disp(is_open)}
        </Combobox.Trigger>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={8} align="start">
            <Combobox.Popup style={props.opts_styles} className={popup_classes}>
              <Combobox.List>
                {visible.map((opt) => props.opt_disp(opt))}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </fieldset>
    </Combobox.Root>
  );
}
