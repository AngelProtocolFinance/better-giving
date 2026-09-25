import type { ReactNode } from "react";

interface IHeader {
  key: string;
  label: string;
}

interface ICsvExporterProps {
  data: readonly object[];
  headers: IHeader[];
  filename?: string;
  classes?: string;
  children: ReactNode;
}

// a spreadsheet evaluates a cell starting with one of these as a formula
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function escape_cell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  // strings only: a negative number must stay a number, not become text
  const str =
    typeof value === "string" && FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  if (/[,"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function to_csv(headers: IHeader[], data: readonly object[]): string {
  const header_row = headers.map((h) => escape_cell(h.label)).join(",");
  const rows = data.map((row) =>
    headers
      .map((h) => escape_cell((row as Record<string, unknown>)[h.key]))
      .join(",")
  );
  return `\uFEFF${[header_row, ...rows].join("\n")}`;
}

export function CsvExporter({
  data,
  headers,
  filename = "export.csv",
  classes,
  children,
}: ICsvExporterProps) {
  function handle_click() {
    const csv = to_csv(headers, data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handle_click}
      className={`flex gap-1 items-center ${classes ?? ""}`}
    >
      {children}
    </button>
  );
}
