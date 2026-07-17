import { InfoIcon, TagIcon } from "lucide-react";
import { href, Link } from "react-router";
import { Amount } from "#/components/amount";
import { Arrow, Content, Tooltip } from "#/components/tooltip";
import { default_allocation } from "@/constants/common";
import { toPP } from "@/helpers/date";
import { humanize } from "@/helpers/decimal";
import { AmountFlow } from "./amount-flow";
import { Fees } from "./fees";
import type { IRow } from "./helpers";

export function Row(props: IRow) {
  return (
    <>
      <td className="whitespace-nowrap">
        {props.date ? toPP(props.date) : "--"}
      </td>
      <td>
        {props.program_id ? (
          <Link
            className="text-primary hover:text-primary"
            to={href("/marketplace/:id/program/:program_id", {
              id: props.recipient_id.toString(),
              program_id: props.program_id,
            })}
          >
            {props.program_name}
          </Link>
        ) : (
          "--"
        )}
      </td>
      <td>
        {props.donation_origin === "bg-widget" ? (
          <div>
            <span className="whitespace-nowrap">Donation Form</span>
            <span className="text-xs mt-0.5 flex items-center gap-1 whitespace-nowrap">
              <TagIcon size={13} className="shrink-0" />
              {props.donation_origin_tag || props.donation_origin_id}
            </span>
          </div>
        ) : (
          "Marketplace"
        )}
      </td>
      <td>{props.payment_method ?? "--"}</td>
      <td>
        <Amount
          amount={+props.amount}
          currency={props.currency}
          amount_usd={+props.amount_usd}
        />
        <p className="text-2xs uppercase">{props.frequency}</p>
      </td>
      <td>
        <Fees {...props.fees} />
      </td>
      <td>
        <span
          className={
            props.status === "refunded" ? "line-through text-destructive" : ""
          }
        >
          ${humanize(props.net_usd, 2)}
        </span>
        {props.status === "refunded" && (
          <Tooltip
            tip={
              <Content className="max-w-xs bg-popover outline outline-border p-4 text-popover-fg text-xs shadow-lg rounded">
                <Arrow />
                Refunded
              </Content>
            }
          >
            <InfoIcon size={14} className="inline ml-1 text-destructive" />
          </Tooltip>
        )}
      </td>
      <td>
        <AmountFlow
          total={+props.net_usd}
          allocation={props.allocation ?? default_allocation}
        />
      </td>
      <td>
        <div>{props?.donor_name ?? "--"}</div>
        <div className="text-xs">{props.donor_email}</div>
        <p className="text-xs mt-0.5">
          {[
            props?.street,
            props?.city,
            props?.state,
            props?.zip_code,
            props?.country,
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
        <p className="text-xs mt-0.5">{props.donor_company}</p>
      </td>
    </>
  );
}
