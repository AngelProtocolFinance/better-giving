import { Folder } from "lucide-react";
import { href, NavLink } from "react-router";
import { HeaderButton } from "#/components/header-button";
import { LoadMoreRow } from "#/components/load-more-row";
import { use_sort } from "#/hooks/use-sort";
import type { IPaginator } from "#/types/components";
import type { IBapp, TStatus } from "@/banking";
import { toPP } from "@/helpers/date";

interface Props extends IPaginator<IBapp> {
  empty_msg?: string;
}

export function Table({
  items,
  classes = "",
  disabled,
  loading,
  load_next,
  empty_msg = "No banking applications found",
}: Props) {
  const { handleHeaderClick, sorted, sortDirection, sortKey } = use_sort(
    items,
    "date_created"
  );

  return (
    <div
      className={`${classes} overflow-x-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border`}
    >
      <table className="table">
        <thead>
          <tr>
            <th>
              <HeaderButton
                onClick={handleHeaderClick("date_created")}
                _activeSortKey={sortKey}
                _sortKey="date_created"
                _sortDirection={sortDirection}
              >
                Date
              </HeaderButton>
            </th>
            <th>Endowment</th>
            <th>Account</th>
            <th>
              <HeaderButton
                onClick={handleHeaderClick("status")}
                _activeSortKey={sortKey}
                _sortKey="status"
                _sortDirection={sortDirection}
              >
                Status
              </HeaderButton>
            </th>
            <th>
              <span className="flex justify-center">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center text-muted-fg py-8">
                {empty_msg}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr key={row.id} className="text-sm">
                <td>{toPP(row.date_created)}</td>
                <td>{row.npo_id}</td>
                <td>{row.bank_summary}</td>
                <td>
                  <Status status={row.status} />
                </td>
                <td>
                  <NavLink
                    to={href("/platform/banking-applications/:id", {
                      id: row.id,
                    })}
                    className="text-center w-full inline-block [.pending]:text-muted-fg hover:text-primary"
                  >
                    <Folder
                      size={22}
                      aria-label="application details"
                      className="inline-block"
                    />
                  </NavLink>
                </td>
              </tr>
            ))
          )}
        </tbody>
        {load_next && (
          <LoadMoreRow
            col_span={5}
            disabled={disabled}
            loading={loading}
            on_load_next={load_next}
          />
        )}
      </table>
    </div>
  );
}

const dot_color: Record<TStatus, string> = {
  approved: "bg-success",
  "under-review": "bg-amber-400",
  rejected: "bg-destructive",
  default: "bg-primary",
};

const text_color: Record<TStatus, string> = {
  approved: "text-success",
  "under-review": "text-amber-600 dark:text-amber-400",
  rejected: "text-destructive",
  default: "text-primary",
};

const text: Record<TStatus, string> = {
  approved: "Approved",
  "under-review": "Under Review",
  rejected: "Rejected",
  default: "Pending",
};

function Status({ status }: { status: TStatus }) {
  return (
    <span
      className={`${text_color[status]} inline-flex items-center gap-1.5 text-xs font-medium`}
    >
      <span
        className={`${dot_color[status]} size-2 rounded-full inline-block shrink-0`}
      />
      {text[status]}
    </span>
  );
}
