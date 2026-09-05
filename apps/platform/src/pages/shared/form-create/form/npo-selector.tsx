import { Combo, DrawerIcon } from "@better-giving/ui";
import { href } from "react-router";
import type { INposPage } from "@/npo/interfaces";
import type { INpoOpt } from "../api";

async function search_npos(q: string, signal: AbortSignal): Promise<INpoOpt[]> {
  const params = new URLSearchParams({
    query: q,
    page: "1",
    fields: "id,name",
  });
  const res = await fetch(`${href("/api/npos")}?${params}`, { signal });
  if (!res.ok) throw res;
  const page: INposPage<"id" | "name"> = await res.json();
  // narrow the api row to the two fields the option is — RHF's field.onChange
  // treats any object with a `target` property as a synthetic event, and
  // INpoItem has a `target` column, so handing the raw row up makes setValue
  // receive undefined.
  return page.items.map((n) => ({ id: n.id, name: n.name }));
}

interface Props {
  label: string;
  required?: boolean;
  value: INpoOpt | undefined;
  on_change: (opt: INpoOpt) => void;
}

export function NpoSelector(p: Props) {
  return (
    <Combo<INpoOpt>
      label={p.label}
      required={p.required}
      placeholder="Search for an organization..."
      options={{ search: search_npos }}
      item_key={(o) => o.id.toString()}
      item_text={(o) => o.name}
      adornment={(open) => <DrawerIcon is_open={open} size={20} />}
      value={p.value}
      // the control offers no clear trigger, so undefined never arrives
      on_change={(o) => o && p.on_change(o)}
    />
  );
}
