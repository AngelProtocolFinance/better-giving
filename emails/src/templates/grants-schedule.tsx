import { Text } from "react-email";
import { PlatformLayout } from "../components/platform-layout";

interface IRow {
  id: number;
  name: string;
  amount: number;
  min: number;
  effect: "pass" | "skipped";
}

export interface IData {
  rows: IRow[];
  total_grant: number;
  wise_usd_balance: number;
  report_period: string;
  low_balance: boolean;
}

const th: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: "8px 12px",
  textAlign: "left",
  backgroundColor: "#f4f4f4",
  fontWeight: 600,
  fontSize: 13,
};

const td: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: "8px 12px",
  fontSize: 13,
};

const td_right: React.CSSProperties = { ...td, textAlign: "right" };

function Jsx({
  rows,
  total_grant,
  wise_usd_balance,
  report_period,
  low_balance,
}: IData) {
  return (
    <PlatformLayout>
      <Text style={{ fontWeight: 600, fontSize: 16 }}>
        {low_balance
          ? "⚠️ WARNING: Low Wise balance for grants"
          : "Grants Schedule"}
      </Text>

      <Text style={{ margin: "4px 0" }}>Period: {report_period}</Text>
      <Text style={{ margin: "4px 0" }}>
        Grant total: <strong>${total_grant.toLocaleString()}</strong>
      </Text>
      <Text
        style={{
          margin: "4px 0",
          color: low_balance ? "#dc2626" : undefined,
        }}
      >
        Wise USD balance: <strong>${wise_usd_balance.toLocaleString()}</strong>
      </Text>

      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          marginTop: 16,
        }}
      >
        <thead>
          <tr>
            <th style={th}>ID</th>
            <th style={th}>Name</th>
            <th style={{ ...th, textAlign: "right" }}>Grant</th>
            <th style={{ ...th, textAlign: "right" }}>Min</th>
            <th style={th}>Effect</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              style={r.effect === "skipped" ? { color: "#9ca3af" } : undefined}
            >
              <td style={td}>{r.id}</td>
              <td style={td}>{r.name}</td>
              <td style={td_right}>${r.amount.toLocaleString()}</td>
              <td style={td_right}>${r.min.toLocaleString()}</td>
              <td style={td}>{r.effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PlatformLayout>
  );
}

export const template = (data: IData) => ({
  node: <Jsx {...data} />,
  subject: data.low_balance
    ? "WARNING: Low wise balance for grants"
    : "Grants schedule",
});
