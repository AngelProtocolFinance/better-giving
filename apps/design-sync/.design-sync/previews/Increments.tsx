import { Increments } from "@better-giving/ui";
import { useState } from "react";

type Row = { id: string; value: string; label: string };

const preset: Row[] = [
  { id: "1", value: "25", label: "Plants 10 rainforest saplings" },
  { id: "2", value: "50", label: "Protects one acre for a month" },
  { id: "3", value: "100", label: "Funds a ranger patrol for a week" },
];

// mirrors the amount + description cells the fundraiser editor passes to
// `field` — two subgrid cells per row, each spanning both rows.
const row = (rows: Row[], valueError?: string) => (idx: number) => {
  const f = rows[idx];
  return (
    <>
      <div className="grid grid-rows-subgrid row-span-2">
        <div className="relative w-full">
          <span className="text-gray-11 absolute top-1/2 left-3 -translate-y-1/2 text-sm">
            $
          </span>
          <input
            type="number"
            step="any"
            readOnly
            value={f?.value ?? ""}
            placeholder="0.00"
            className="field-input h-full pl-8 font-medium"
          />
        </div>
        <p className="mt-1 empty:hidden text-left text-xs text-destructive">
          {idx === 0 ? valueError : ""}
        </p>
      </div>
      <div className="grid grid-rows-subgrid row-span-2">
        <textarea
          rows={2}
          readOnly
          value={f?.label ?? ""}
          className="w-full outline-ring rounded text-sm font-medium bg-surface px-4 py-3.5 placeholder:text-gray-11 border"
        />
        <p className="mt-1 empty:hidden text-left text-xs text-destructive" />
      </div>
    </>
  );
};

export const Filled = () => {
  const [rows, set] = useState(preset);
  return (
    <Increments
      fields={rows}
      field={row(rows)}
      onAdd={(value) =>
        set((r) => [...r, { id: `${r.length + 1}`, value, label: "" }])
      }
      onRemove={(idx) => set((r) => r.filter((_, i) => i !== idx))}
    />
  );
};

export const Empty = () => {
  const [rows, set] = useState<Row[]>([]);
  return (
    <Increments
      fields={rows}
      field={row(rows)}
      onAdd={(value) =>
        set((r) => [...r, { id: `${r.length + 1}`, value, label: "" }])
      }
      onRemove={(idx) => set((r) => r.filter((_, i) => i !== idx))}
    />
  );
};

export const WithCountError = () => {
  const rows: Row[] = [
    { id: "1", value: "25", label: "Plants 10 rainforest saplings" },
  ];
  return (
    <Increments
      fields={rows}
      field={row(rows)}
      onAdd={() => {}}
      onRemove={() => {}}
      countError="Add at least two increments"
    />
  );
};

export const WithFieldError = () => {
  const rows: Row[] = [
    { id: "1", value: "0", label: "Plants 10 rainforest saplings" },
    { id: "2", value: "50", label: "Protects one acre for a month" },
  ];
  return (
    <Increments
      fields={rows}
      field={row(rows, "Must be greater than 0")}
      onAdd={() => {}}
      onRemove={() => {}}
    />
  );
};
