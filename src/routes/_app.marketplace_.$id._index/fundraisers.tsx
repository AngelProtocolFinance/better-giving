import { href, Link, NavLink } from "react-router";
import { to_text } from "#/components/rich-text";
import { Target, to_target } from "#/components/target";
import type { IFundItem } from "@/fundraiser";

interface Props {
  classes?: string;
  funds: IFundItem[];
}
/** fundraisers that `endowId` is the only member of (not an index fund)  */
export function Fundraisers({ classes = "", funds }: Props) {
  return (
    <div className={`${classes} p-8 border rounded`}>
      <h3 className="mb-4 border-b pb-2">Fundraisers</h3>
      <div className="grid gap-y-8">
        {funds.map((f) => (
          <Fund key={f.id} {...f} />
        ))}
      </div>
    </div>
  );
}

function Fund(props: IFundItem) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 py-2">
      <img
        src={props.logo}
        alt="fundraiser logo"
        width={40}
        height={40}
        className="row-span-2 shrink-0"
      />
      <Link
        className="hover:text-primary"
        to={href("/fundraisers/:fund_id", {
          fund_id: props.id,
        })}
      >
        {props.name}
      </Link>
      <p className="text-muted-fg text-sm line-clamp-3">
        {to_text(props.description_pt ?? undefined)}
      </p>
      <Target
        classes="col-span-full mt-4"
        target={to_target(props.target)}
        progress={props.donation_total_usd}
      />
      <NavLink
        to={href("/fundraisers/:fund_id/donate", {
          fund_id: props.id,
        })}
        className="btn btn-primary text-xs w-full col-span-full mt-4"
      >
        Donate
      </NavLink>
    </div>
  );
}
