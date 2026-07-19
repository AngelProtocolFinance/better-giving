import type { ReactNode } from "react";
import { Text } from "react-email";

export interface KeyValueProps {
  label: string;
  value: ReactNode;
}

export function KeyValue({ label, value }: KeyValueProps) {
  return (
    <Text style={{ margin: "2px 0" }}>
      <strong style={{ fontSize: 14 }}>{label}</strong>: <span>{value}</span>
    </Text>
  );
}
