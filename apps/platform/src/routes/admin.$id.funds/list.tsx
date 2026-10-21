import { EmptyState, Select } from "@better-giving/ui";
import { useSearchParams } from "react-router";
import type { IFundItem } from "@/fundraiser";
import { fund_creator } from "./creator";
import { FundItem } from "./fund-item";

type Creator = "all" | "ours" | "others";

const LABELS: Record<Creator, string> = {
  all: "All",
  ours: "By Us",
  others: "By Our Supporters",
};
const OPTIONS: Creator[] = ["all", "ours", "others"];

interface IFundsList {
  funds: IFundItem[];
  endow_id: number;
  platform_admin: boolean;
}

export function FundsList({ funds, endow_id, platform_admin }: IFundsList) {
  const [searchParams, setSearchParams] = useSearchParams();
  const creator: Creator = fund_creator(searchParams.get("creator")) ?? "all";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-11">
          These are fundraisers people started for your nonprofit. You can leave
          any you don't want to receive from.
        </p>
        <Select
          compact
          label="Creator"
          options={OPTIONS}
          value={creator}
          option_disp={(v) => LABELS[v]}
          onChange={(v) => {
            const next = new URLSearchParams(searchParams);
            next.set("tab", "fundraisers");
            if (v === "all") next.delete("creator");
            else next.set("creator", v);
            setSearchParams(next, { preventScrollReset: true });
          }}
        />
      </div>
      <div className="grid @xl:grid-cols-2 @2xl:grid-cols-3 gap-4">
        {funds.length === 0 ? (
          creator === "all" ? (
            <EmptyState classes="mt-4" heading="No supporter fundraisers yet">
              Fundraisers people start for your nonprofit will show up here.
            </EmptyState>
          ) : (
            <EmptyState classes="mt-4">
              No supporter fundraisers found
            </EmptyState>
          )
        ) : (
          funds.map((fund) => (
            <FundItem
              key={fund.id}
              {...fund}
              isEditor={platform_admin || fund.npo_owner === endow_id}
              isSelf={fund.npo_owner === endow_id}
            />
          ))
        )}
      </div>
    </>
  );
}
