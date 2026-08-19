import { status_cls, status_text } from "../classes";

interface IStatus {
  loading?: boolean;
  error?: string;
  /** what the user typed; empty string when they haven't */
  query: string;
  /** rows the popup is about to render */
  count: number;
}

/**
 * the one line that stands in for the option rows, across all four states a
 * list can be in. renders nothing when there are rows to show.
 *
 * `Combobox.Empty` covers only the empty case and not loading or failed, so
 * this owns all four rather than splitting them across two mechanisms.
 */
export function Status(p: IStatus) {
  const msg = p.loading
    ? status_text.loading
    : (p.error ??
      (p.count > 0
        ? null
        : p.query
          ? status_text.no_match(p.query)
          : status_text.empty));

  if (!msg) return null;
  return <p className={status_cls}>{msg}</p>;
}
