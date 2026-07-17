import { Portal } from "@ark-ui/react/portal";
import { createListCollection, Select } from "@ark-ui/react/select";
import { ChevronDownIcon, TagIcon } from "lucide-react";
import { href, NavLink, useNavigate, useSearchParams } from "react-router";
import { LoadMoreRow } from "#/components/load-more-row";
import { Target } from "#/components/target";
import { to_usd } from "#/helpers/to-usd";
import type { IPaginator } from "#/types/components";
import { toPP } from "@/helpers/date";
import type { FormRow } from "$/pg/queries/form";

type Filter = "all" | "active" | "inactive";
const FILTER_OPTS: Filter[] = ["all", "active", "inactive"];
const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  active: "Active",
  inactive: "Inactive",
};
const FILTER_COLLECTION = createListCollection({
  items: FILTER_OPTS,
  itemToString: (v) => FILTER_LABEL[v],
});

interface Props extends IPaginator<FormRow> {
  status: string;
}

export function FormsTable({
  items,
  load_next,
  loading,
  disabled,
  status,
  classes = "",
}: Props) {
  return (
    <div className={classes}>
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Form</th>
              <th>
                <StatusFilter value={status as Filter} />
              </th>
              <th>Program</th>
              <th>Raised / Goal</th>
              <th className="text-right">Donations</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted-fg py-8">
                  No {status === "all" ? "" : status} forms found
                </td>
              </tr>
            ) : (
              items.map((f) => (
                <tr key={f.id}>
                  <Row {...f} />
                </tr>
              ))
            )}
          </tbody>
          {load_next && (
            <LoadMoreRow
              col_span={7}
              disabled={disabled}
              loading={loading}
              on_load_next={load_next}
            />
          )}
        </table>
      </div>
    </div>
  );
}

function Row(f: FormRow) {
  const target = f.target_smart ? "smart" : (f.target_number ?? null);
  return (
    <>
      {/* form tag/name → links to edit */}
      <td>
        <div className="flex items-center gap-2">
          <TagIcon size={14} className="shrink-0 text-muted-fg" />
          <NavLink
            to={href("/forms/:id/edit", { id: f.id })}
            className="font-medium hover:text-primary"
          >
            {f.tag || f.name}
          </NavLink>
        </div>
      </td>

      {/* status */}
      <td>
        <StatusBadge status={f.status} />
      </td>

      {/* program */}
      <td className="text-muted-fg">{f.program_name || "—"}</td>

      {/* raised / goal */}
      <td>
        {target !== null ? (
          <Target.Inline target={target} progress={f.ltd ?? 0} />
        ) : (
          <span className="text-sm text-muted-fg">{to_usd(f.ltd ?? 0)}</span>
        )}
      </td>

      {/* donation count */}
      <td className="text-right tabular-nums">
        {(f.ltd_count ?? 0).toLocaleString()}
      </td>

      {/* created */}
      <td className="whitespace-nowrap text-muted-fg">
        {f.date_created ? toPP(f.date_created) : "—"}
      </td>

      {/* actions */}
      <td className="text-right">
        {f.status === "active" && (
          <NavLink
            to={`${f.id}/disable`}
            className="text-destructive hover:text-destructive text-xs font-medium"
          >
            Disable
          </NavLink>
        )}
      </td>
    </>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const is_active = status === "active";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium ${
        is_active ? "bg-success/10 text-success" : "bg-muted text-muted-fg"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${is_active ? "bg-success" : "bg-muted-fg"}`}
      />
      {is_active ? "Active" : "Inactive"}
    </span>
  );
}

function StatusFilter({ value }: { value: Filter }) {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  return (
    <Select.Root
      collection={FILTER_COLLECTION}
      value={[value]}
      onValueChange={(e) => {
        const v = e.value[0];
        if (!v) return;
        const p = new URLSearchParams(search);
        p.set("status", v);
        p.delete("next");
        navigate(`?${p.toString()}`);
      }}
      positioning={{ placement: "bottom-start", gutter: 4 }}
    >
      <Select.Trigger className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide cursor-pointer">
        <Select.ValueText placeholder="Status" />
        <ChevronDownIcon size={14} className="text-muted-fg" />
      </Select.Trigger>
      <Portal>
        <Select.Positioner>
          <Select.Content className="rounded-xs border bg-popover text-popover-fg min-w-28 overflow-hidden origin-(--transform-origin) data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out z-10">
            {FILTER_OPTS.map((v) => (
              <Select.Item key={v} item={v} className="selector-opt text-sm">
                <Select.ItemText>{FILTER_LABEL[v]}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
