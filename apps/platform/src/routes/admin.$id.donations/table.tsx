import { EmptyRow, LoadMoreRow } from "@better-giving/ui";
import { Arrow, Content, Tooltip } from "@better-giving/ui/tooltip";
import { InfoIcon, SparklesIcon } from "lucide-react";
import { app_name } from "#/constants/env";
import type { IPaginator } from "#/types/components";
import type { IRow } from "./helpers";
import { Row } from "./row";

interface Props extends IPaginator<IRow> {}

export function Table({ items, load_next, loading, disabled }: Props) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Program</th>
          <th>Origin</th>
          <th>Method</th>
          <th>Amount</th>
          <th>
            <div className="flex items-center gap-x-1">
              <span>Fees </span>
              <Tooltip
                tip={
                  <Content className="max-w-sm text-sm">
                    <p className="text-xs uppercase font-semibold">
                      Base fee{" "}
                      <span className="text-primary text-xs font-bold">
                        1.5%
                      </span>
                    </p>
                    <p className="mb-4">
                      charged when {app_name} tip screen is disabled at the time
                      of donation
                    </p>
                    <p className="text-xs uppercase font-semibold">
                      Fiscal sponsorship fee{" "}
                      <span className="text-primary text-xs font-bold">
                        2.9%
                      </span>
                    </p>
                    <p className="text-xs uppercase font-semibold mt-4">
                      Processing fee
                    </p>
                    <p>charged by payment processor (Stripe, Chariot, etc.)</p>
                    <p>
                      covered by donor
                      <SparklesIcon
                        className="fill-success stroke-success ml-1 inline"
                        size={13}
                      />
                    </p>
                    <Arrow />
                  </Content>
                }
              >
                <InfoIcon size={14} className="text-gray-11" />
              </Tooltip>
            </div>
          </th>
          <th>Net</th>
          <th>Allocation</th>
          <th>Donor</th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 && (
          <EmptyRow col_span={9}>No donations yet</EmptyRow>
        )}
        {items.map((record) => (
          <tr key={record.id}>
            <Row {...record} />
          </tr>
        ))}
      </tbody>
      {load_next && (
        <LoadMoreRow
          col_span={9}
          disabled={disabled}
          loading={loading}
          on_load_next={load_next}
        />
      )}
    </table>
  );
}
