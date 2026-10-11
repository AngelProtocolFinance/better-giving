import { LoaderCircle } from "lucide-react";

interface Props {
  col_span: number;
  disabled?: boolean;
  loading?: boolean;
  on_load_next(): void;
}

export function LoadMoreRow(props: Props) {
  return (
    <tfoot>
      <LoadMoreTr {...props} />
    </tfoot>
  );
}

/** bare <tr> variant; use when the table already owns its <tfoot> */
export function LoadMoreTr({
  col_span,
  disabled,
  loading,
  on_load_next,
}: Props) {
  // held rather than `disabled`, which would blur the button just pressed and
  // leave focus on `<body>` when the next page lands
  const held = !!(disabled || loading);
  return (
    <tr>
      {/* override .table td padding — otherwise button hover bg doesn't fill the cell */}
      <td colSpan={col_span} className="p-0">
        <button
          aria-disabled={held}
          aria-busy={!!loading}
          onClick={() => {
            if (!held) on_load_next();
          }}
          type="button"
        >
          <LoaderCircle
            className={`icon-xl ${loading ? "animate-spin" : "invisible"}`}
          />
          {loading ? "Loading..." : "View More"}
        </button>
      </td>
    </tr>
  );
}
