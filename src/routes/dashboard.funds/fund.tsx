import { href, Link } from "react-router";
import { FundStatus, status_fn } from "#/components/fundraiser";
import { Target, to_target } from "#/components/target";
import type { IFundRow } from "$/pg/queries/fund";

export const Fund = (props: IFundRow) => {
  const status = status_fn(
    props.expiration ?? undefined,
    props.active,
    props.donation_total_usd
  );
  return (
    <div className="grid grid-rows-subgrid row-span-4 content-start gap-y-0 items-center border p-3 rounded">
      <div className="flex items-start justify-between">
        <img
          src={props.logo}
          width={50}
          className="object-cover aspect-square rounded-full"
          alt=""
        />

        <FundStatus
          status={status}
          classes={{
            container: "px-3 py-1 rounded-full text-xs",
            active: "",
            inactive: "bg-destructive/10 text-destructive",
            expired: "bg-muted text-muted-fg",
            completed: "bg-success/10 text-success",
          }}
        />
      </div>

      <Link
        to={href("/fundraisers/:fund_id", { fund_id: props.id })}
        className="mt-4 font-semibold text-muted-fg hover:text-primary "
      >
        {props.name}
      </Link>

      <Target
        classes="mt-4"
        progress={props.donation_total_usd}
        target={props.target ? to_target(props.target) : null}
      />

      <Link
        aria-disabled={!status.active}
        className="btn btn btn-primary rounded text-xs px-6 py-2 justify-self-end mt-6"
        to={href("/fundraisers/:fund_id/edit", { fund_id: props.id })}
      >
        Edit
      </Link>
    </div>
  );
};
