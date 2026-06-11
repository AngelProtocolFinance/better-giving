import { Check, CircleCheck, Copy } from "lucide-react";
import { useState } from "react";
import { href } from "react-router";
import { emails } from "@/constants/common";
import { use_copier } from "../../copier/use-copier";
import { LoadText } from "../../load-text";
import { BackBtn } from "../common/back-btn";
import { use_donation } from "../context";
import {
  type IraQcdDonationDetails,
  is_fund,
  tip_val,
  to_step,
} from "../types";
import { DonationTerms } from "./donation-terms";

export function IraQcdCheckout(props: IraQcdDonationDetails) {
  const { don, don_set } = use_donation();
  const id = don.recipient.id;
  const path = is_fund(id)
    ? href("/fundraisers/:fund_id", { fund_id: id })
    : href("/marketplace/:id", { id: id });

  const tipv = tip_val(props.tip_format, props.tip, +props.amount);
  const total = +props.amount + tipv;
  const url = `${don.base_url}${path}`;
  const name = don.recipient.name;

  const instructions_text = [
    "Payee name: Better Giving, Inc.",
    "EIN: 87-3758939",
    "Mailing address: 18 Cottekill Rd, Rosendale, NY 12472",
    `Reference: ${name}`,
    `Project URL: ${url}`,
    `Amount: $${total.toFixed(2)}`,
    ...(props.custodian ? [`Custodian: ${props.custodian}`] : []),
  ].join("\n");

  const { handle_copy, copied } = use_copier(instructions_text);
  const [status, set_status] = useState<"idle" | "loading" | "ok" | "error">(
    "idle"
  );

  return (
    <div className="grid content-start p-4 @xl/steps:p-8">
      <BackBtn
        type="button"
        onClick={() => to_step("ira_qcd", props, "form", don_set)}
      />
      <p className="mt-4 text-center text-muted-fg uppercase">
        IRA Donation Pending
      </p>
      <p className="mt-4 text-center">
        To complete this donation, please provide your IRA custodian with the
        following information.
      </p>

      <div className="grid gap-y-1 rounded bg-muted p-3 text-sm leading-relaxed mt-6">
        <Row label="Payee name" value="Better Giving, Inc." />
        <Row label="EIN" value="87-3758939" />
        <div>
          <span>Mailing address:</span>
          <span className="block pl-2">
            Better Giving, Inc.
            <br />
            18 Cottekill Rd
            <br />
            Rosendale, NY 12472
          </span>
        </div>
        <Row label="Reference" value={name} />
        <Row label="Project URL" value={url} />
        <Row label="Amount" value={`$${total.toFixed(2)}`} />
        {props.custodian && <Row label="Custodian" value={props.custodian} />}
      </div>

      <div className="flex justify-center gap-4 mt-6">
        <a
          href={email_link(name, url, total)}
          className="btn btn-secondary rounded px-4 py-1.5 text-xs font-normal"
        >
          Generate Email
        </a>
        <button
          type="button"
          onClick={handle_copy}
          className="btn btn-secondary rounded px-4 py-1.5 text-xs font-normal inline-flex items-center gap-1"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          Copy Instructions
        </button>
      </div>

      <p className="mt-6 text-sm">
        To ensure quick processing, please let us know when you've submitted
        your IRA request by clicking the button below. Alternatively, please
        copy or forward the email you send to {emails.hi}.
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
                  type: "ira_qcd",
                  recipient_name: name,
                  recipient_url: url,
                  details: {
                    amount: String(total),
                    ...(props.custodian ? { custodian: props.custodian } : {}),
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
            I've Submitted My IRA Request
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
  amount: number
) => `
mailto:${encodeURIComponent("[Your IRA custodian's email]")}
  ?cc=${emails.hi}
  &subject=IRA charitable donation to Better Giving supporting ${charity_name}
  &body=
Hi,${NEW_LINE}
${NEW_LINE}
I would like to request a Qualified Charitable Distribution (QCD) from my IRA to support ${charity_name} (${profile_url}).${NEW_LINE}
${NEW_LINE}
Please use the following information:${NEW_LINE}
Payee name: Better Giving, Inc.${NEW_LINE}
EIN: 87-3758939${NEW_LINE}
Mailing address: 18 Cottekill Rd, Rosendale, NY 12472${NEW_LINE}
Reference: ${charity_name} (${profile_url})${NEW_LINE}
Amount: $${amount.toFixed(2)}${NEW_LINE}
${NEW_LINE}
I have copied ${emails.hi} so the donation can be properly recognized and designated. Please let me know if you need any additional information.${NEW_LINE}
${NEW_LINE}
Thank you.`;
