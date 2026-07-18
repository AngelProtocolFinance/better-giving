import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";

export function HeaderButton<T>(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    _sortDirection: "asc" | "desc";
    _sortKey: keyof T;
    _activeSortKey: keyof T;
  }
) {
  const {
    _activeSortKey,
    _sortKey,
    _sortDirection,
    children,
    className,
    ...restProps
  } = props;
  return (
    <button
      {...restProps}
      className={`${className} flex items-center justify-between gap-1`}
    >
      <span>{children}</span>

      {_activeSortKey === _sortKey ? (
        _sortDirection === "asc" ? (
          <ChevronUp className="size-4 shrink-0" />
        ) : (
          <ChevronDown className="size-4 shrink-0" />
        )
      ) : (
        <ChevronsUpDown className="size-4 shrink-0 text-muted-fg" />
      )}
    </button>
  );
}
