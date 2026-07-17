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

function escape_cell(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
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
