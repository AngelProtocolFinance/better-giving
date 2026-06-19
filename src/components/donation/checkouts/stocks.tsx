import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { href } from "react-router";
import { emails } from "@/constants/common";
import { ru_vdec } from "@/helpers/decimal";
import { Copier } from "../../copier";
import { LoadText } from "../../load-text";
import { BackBtn } from "../common/back-btn";
import { use_donation } from "../context";
import {
  is_fund,
  type StocksDonationDetails,
  tip_val,
  to_step,
} from "../types";
import { DonationTerms } from "./donation-terms";

export function Stocks(props: StocksDonationDetails) {
  const { don, don_set } = use_donation();
  const id = don.recipient.id;
  const path = is_fund(id)
    ? href("/fundraisers/:fund_id", { fund_id: id })
    : href("/marketplace/:id", { id: id });

  const tipv = tip_val(props.tip_format, props.tip, +props.ticker.amount);
  const shares = ru_vdec(tipv + +props.ticker.amount, props.ticker.usdpu);
  const url = `${don.base_url}${path}`;
  const name = don.recipient.name;

  const instructions_text = [
    `Shares: ${shares}`,
    `Ticker: ${props.ticker.symbol}`,
    "Deliver to: Fidelity Investments",
    "DTC number: 0226",
    "Account number: Z40390069",
    "Account name: Better Giving, Inc.",
    `Reference: ${name}`,
    `Project URL: ${url}`,
  ].join("\n");

  const [status, set_status] = useState<"idle" | "loading" | "ok" | "error">(
    "idle"
  );

  return (
    <div className="grid content-start p-4 @xl/steps:p-8">
      <BackBtn
        type="button"
        onClick={() => to_step("stocks", props, "form", don_set)}
      />
      <p className="mt-4 text-center text-muted-fg uppercase">
        Stock Donation Pending
      </p>
      <p className="mt-4 text-center">
        To complete this donation, please provide your broker with the following
        transfer instructions.
      </p>
      <div className="grid gap-y-1 rounded bg-muted p-3 text-sm leading-relaxed mt-6">
        <Row label="Shares" value={shares} />
        <Row label="Ticker" value={props.ticker.symbol} />
        <Row label="Deliver to" value="Fidelity Investments" />
        <Row label="DTC number" value="0226" />
        <Row label="Account number" value="Z40390069" />
        <Row label="Account name" value="Better Giving, Inc." />
        <Row label="Reference" value={name} />
        <Row label="Project URL" value={url} />
      </div>

      <h4 className="text-sm font-medium mt-6 mb-1">
        You may also need the following information
      </h4>
      <span className="rounded bg-muted p-3 text-sm leading-relaxed">
        Better Giving is a nonprofit with 501(c)(3) tax-exempt status. EIN:
        87-3758939.
      </span>

      <div className="flex justify-center gap-4 mt-6">
        <a
          href={email_link(
            name,
            url,
            +props.ticker.amount,
            props.ticker.symbol
          )}
          className="btn btn-secondary rounded px-4 py-1.5 text-xs font-normal"
        >
          Generate Email
        </a>
        <Copier
          text={instructions_text}
          size={14}
          classes="btn btn-secondary rounded px-4 py-1.5 text-xs font-normal inline-flex items-center gap-1"
        >
          Copy Instructions
        </Copier>
      </div>

      <p className="mt-6 text-sm">
        To ensure quick processing, please let us know when you've contacted
        your broker by clicking the button below. Alternatively, please copy or
        forward the email you send to {emails.hi}.
      </p>

      {status === "ok" ? (
        <p className="mt-6 text-sm inline-flex items-center gap-1.5 text-success">
          <CircleCheck size={16} />
          Thanks! We'll look out for it.
        </p>
      ) : status === "error" ? (
        <p className="mt-6 text-sm text-destructive">
          Something went wrong — please email {emails.hi} instead.
        </p>
      ) : (
        <button
          type="button"
          disabled={status === "loading"}
          onClick={async () => {
            set_status("loading");
            try {
              const res = await fetch("/api/donation-notifications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "stocks",
                  recipient_name: name,
                  recipient_url: url,
                  details: {
                    ticker: props.ticker.symbol,
                    shares: String(shares),
                    amount: String(props.ticker.amount),
                  },
                }),
              });
              set_status(res.ok ? "ok" : "error");
            } catch {
              set_status("error");
            }
          }}
          className="btn btn-primary rounded py-3 w-full mt-6"
        >
          <LoadText is_loading={status === "loading"}>
            I've Contacted My Broker
          </LoadText>
        </button>
      )}

      <DonationTerms endowName={name} classes="mt-5 border-t pt-4" />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-x-2">
      <span className="shrink-0">{label}:</span>
      <span className="break-all">{value}</span>
    </div>
  );
}

const NEW_LINE = "%0D%0A";
const email_link = (
  charity_name: string,
  profile_url: string,
  number_of_shares: number,
  stock_symbol: string
) => `
mailto:${encodeURIComponent("[Your broker's email]")}
  ?cc=${emails.hi}
  &subject=Stock donation to Better Giving supporting ${charity_name}
  &body=
Hi,${NEW_LINE}
${NEW_LINE}
I would like to make a charitable stock donation to Better Giving in support of ${charity_name} (${profile_url}).${NEW_LINE}
${NEW_LINE}
Please process the transfer using the following instructions:${NEW_LINE}
Deliver to: Fidelity Investments${NEW_LINE}
DTC number: 0226${NEW_LINE}
Account number: Z40390069${NEW_LINE}
Account name: Better Giving, Inc.${NEW_LINE}
Reference: ${charity_name} (${profile_url})${NEW_LINE}
Ticker: ${stock_symbol || "[STOCK_SYMBOL]"}${NEW_LINE}
Shares: ${number_of_shares || "[NUMBER_OF_SHARES]"}${NEW_LINE}
${NEW_LINE}
Better Giving EIN: 87-3758939${NEW_LINE}
${NEW_LINE}
I have copied ${emails.hi} so the donation can be properly recognized and designated. Please let me know if you need any additional information.${NEW_LINE}
${NEW_LINE}
Thank you.`;
