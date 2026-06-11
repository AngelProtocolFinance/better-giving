import { fromUnixTime } from "date-fns";
import { LoaderCircle, Split } from "lucide-react";
import { href, Link, NavLink, useFetcher } from "react-router";
import { FundCreator, FundStatus, status_fn } from "#/components/fundraiser";
import { Target, to_target } from "#/components/target";
import type { IFundItem } from "@/fundraiser";

interface Props extends IFundItem {
  isSelf: boolean;
  isEditor: boolean;
}
export const FundItem = (props: Props) => {
  const fetcher = useFetcher({ key: `fund-${props.id}` });
  const status = status_fn(
    fromUnixTime(props.expiration).toISOString(),
    props.active,
    props.donation_total_usd
  );

  return (
    <div className="grid grid-rows-subgrid row-span-6 content-start gap-y-0 items-center border p-3 rounded">
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
      <div className="mb-2">
        <span className="text-xs mr-1">by</span>
        <FundCreator
          name={props.creator_name}
          id={props.creator_id}
          classes="text-sm inline"
        />
      </div>

      <Target
        classes="mt-4"
        progress={props.donation_total_usd}
        target={to_target(props.target)}
      />

      <fetcher.Form
        method="POST"
        className="flex items-center justify-between gap-x-6 mt-6"
      >
        {/** fund item won't show once NPO opted out of it: so no need to hide this button */}
        {!props.isSelf ? (
          <button
            name="fund_id"
            value={props.id}
            className=" bg-warning enabled:hover:bg-warning text-warning-fg rounded px-4 py-2 text-xs flex items-center gap-1 disabled:bg-muted disabled:text-muted-fg"
            type="submit"
            disabled={fetcher.state !== "idle" || !props.active}
          >
            {fetcher.state === "submitting" ? (
              <LoaderCircle size={12} className="animate-spin" />
            ) : (
              <Split size={12} className="rotate-90" />
            )}

            <span>
              {fetcher.state === "submitting" ? "Opting out.." : "Opt out"}
            </span>
          </button>
        ) : (
          <div data-placeholder />
        )}
        <NavLink
          aria-disabled={!status.active}
          className={`btn btn btn-primary rounded text-xs px-6 py-2 ${
            props.isEditor ? "" : "invisible"
          }`}
          to={href("/fundraisers/:fund_id/edit", { fund_id: props.id })}
        >
          Edit
        </NavLink>
      </fetcher.Form>
    </div>
  );
};
