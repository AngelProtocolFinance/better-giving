import { Combobox, createListCollection } from "@ark-ui/react/combobox";
import { Portal } from "@ark-ui/react/portal";
import { Check, Search, X } from "lucide-react";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { Image } from "#/components/image";
import type { EndowFundMembersOptionsPage } from "#/types/npo";
import type { EndowOption } from "../schema";

type OnChange = (opts: EndowOption[]) => void;
interface Props {
  values: EndowOption[];
  onChange: OnChange;
  classes?: string;
  disabled?: boolean;
  error?: string;
  ref?: React.Ref<HTMLInputElement>;
}

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; msg: string }
  | { status: "ok"; data: EndowOption[] };

async function fetch_endows(
  query: string,
  signal: AbortSignal
): Promise<EndowOption[]> {
  const params = new URLSearchParams({
    query,
    page: "1",
    fund_opt_in: "true",
    fields: "id,name,card_img",
  });
  const res = await fetch(`/api/npos?${params}`, { signal });
  if (!res.ok) throw res;
  const data: EndowFundMembersOptionsPage = await res.json();
  return data.items.map((o) => ({
    id: o.id,
    name: o.name,
    logo: o.card_img ?? undefined,
  }));
}

export function EndowmentSelector(props: Props) {
  const [search, set_search] = useState<SearchState>({ status: "idle" });
  const [search_q, set_search_q] = useState("");
  const abort_ref = useRef<AbortController | null>(null);

  const search_results = search.status === "ok" ? search.data : [];

  // merge selected values so ark keeps them registered in the collection
  const items = useMemo(() => {
    const ids = new Set(search_results.map((r) => r.id));
    return [...search_results, ...props.values.filter((v) => !ids.has(v.id))];
  }, [search_results, props.values]);

  const collection = useMemo(
    () =>
      createListCollection({
        items,
        itemToValue: (i) => i.id.toString(),
        itemToString: (i) => i.name,
      }),
    [items]
  );

  function fire_search(q: string) {
    const controller = new AbortController();
    abort_ref.current?.abort();
    abort_ref.current = controller;
    set_search({ status: "loading" });

    fetch_endows(q, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        set_search({ status: "ok", data });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        set_search({ status: "error", msg: "Failed to load endowments" });
      });
  }

  function get_status() {
    if (search.status === "loading") return "Searching…";
    if (search.status === "error") return search.msg;
    if (search_q.trim() && search_results.length === 0) {
      return `${search_q.trim()} not found`;
    }
    return null;
  }

  return (
    <div className={props.classes ?? "relative"}>
      <Combobox.Root
        multiple
        disabled={props.disabled}
        collection={collection}
        value={props.values.map((v) => v.id.toString())}
        onValueChange={(e) => {
          const next = e.items as EndowOption[];
          props.onChange(next);
          if (next.length > props.values.length) set_search_q("");
        }}
        onOpenChange={(e) => {
          if (e.open && search_results.length === 0) fire_search("");
        }}
        onInputValueChange={(e) => {
          if (e.reason !== "input-change") return;
          set_search_q(e.inputValue);
          fire_search(e.inputValue);
        }}
        positioning={{ placement: "bottom", gap: 4 }}
        openOnClick
      >
        <Combobox.Label className="block text-sm font-medium mb-2 w-fit">
          I want to raise funds for …{" "}
          <span className="text-destructive">*</span>
        </Combobox.Label>
        <Combobox.Control
          aria-invalid={!!props.error}
          aria-disabled={props.disabled}
          className="field-input text-sm flex flex-wrap items-center gap-2 min-h-12 focus-within:outline-2 outline-ring aria-invalid:border-destructive p-1"
        >
          {props.values.map((v) => (
            <div
              key={v.id}
              className="flex items-center px-3 gap-2 h-10 border rounded font-semibold text-muted-fg"
            >
              <Image src={v.logo} className="w-8" />
              <span className="max-w-50 truncate">{v.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  props.onChange(props.values.filter((x) => x.id !== v.id));
                }}
              >
                <X size={20} />
              </button>
            </div>
          ))}

          <Search size={20} className="text-muted-fg ml-2 shrink-0" />
          <Combobox.Input
            className="appearance-none bg-transparent focus:outline-hidden h-10 min-w-30 flex-1"
            ref={props.ref}
          />
        </Combobox.Control>

        <Portal>
          <Combobox.Positioner>
            <Combobox.Content className="z-10 w-(--reference-width) bg-popover text-popover-fg text-sm border max-h-40 scrollbar-thin scrollbar-thumb-ring scrollbar-track-border overflow-y-auto rounded shadow-xl shadow-black/5">
              {get_status() ? (
                <p className="p-2 text-sm text-muted-fg">{get_status()}</p>
              ) : (
                items.map((item) => (
                  <Combobox.Item
                    key={item.id}
                    item={item}
                    className="flex gap-x-2 p-2 items-center data-[state=checked]:text-primary data-highlighted:bg-secondary hover:bg-secondary select-none cursor-default"
                  >
                    <Combobox.ItemIndicator className="w-5">
                      <Check size={16} />
                    </Combobox.ItemIndicator>
                    <Image src={item.logo} className="w-8" />
                    <span>{item.name}</span>
                  </Combobox.Item>
                ))
              )}
            </Combobox.Content>
          </Combobox.Positioner>
        </Portal>
      </Combobox.Root>
      <p className="field-err mt-1 empty:hidden">{props.error}</p>
      <p className="text-sm text-muted-fg mt-1">
        You may include more than one nonprofit in a joint fundraiser, if those
        nonprofits have opted in to fundraising functionality. Raised funds will
        be split equally between the nonprofits.
      </p>
    </div>
  );
}
