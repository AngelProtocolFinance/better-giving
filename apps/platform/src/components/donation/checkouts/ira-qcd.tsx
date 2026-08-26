import { ADDRESS, ADDRESS_LINES, EIN, LEGAL_NAME } from "@better-giving/brand";
import { Copier, LoadText } from "@better-giving/ui";
import { CircleCheck } from "lucide-react";
import { Fragment, useState } from "react";
import { href } from "react-router";
import { emails } from "@/constants/common";
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
    `Payee name: ${LEGAL_NAME}`,
    `EIN: ${EIN}`,
    `Mailing address: ${ADDRESS}`,
    `Reference: ${name}`,
    `Project URL: ${url}`,
    `Amount: $${total.toFixed(2)}`,
    ...(props.custodian ? [`Custodian: ${props.custodian}`] : []),
  ].join("\n");

  const [status, set_status] = useState<"idle" | "loading" | "ok" | "error">(
    "idle"
  );

  return (
    <div className="grid content-start p-4 @xl/steps:p-8">
      <BackBtn
        type="button"
        onClick={() => to_step("ira_qcd", props, "form", don_set)}
      />
      <p className="mt-4 text-center text-gray-11 uppercase">
        IRA Donation Pending
      </p>
      <p className="mt-4 text-center">
        To complete this donation, please provide your IRA custodian with the
        following information.
      </p>

      <div className="grid gap-y-1 rounded bg-gray-3 p-3 text-sm leading-relaxed mt-6">
        <Row label="Payee name" value={LEGAL_NAME} />
        <Row label="EIN" value={EIN} />
        <div>
          <span>Mailing address:</span>
          <span className="block pl-2">
            {LEGAL_NAME}
            {ADDRESS_LINES.map((line) => (
              <Fragment key={line}>
                <br />
                {line}
              </Fragment>
            ))}
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
          className="btn btn-sm btn-secondary rounded font-normal"
        >
          Generate Email
        </a>
        <Copier
          text={instructions_text}
          size={14}
          classes="btn btn-sm btn-secondary rounded font-normal inline-flex items-center gap-1"
        >
          Copy Instructions
        </Copier>
      </div>

      <p className="mt-6 text-sm">
        To ensure quick processing, please let us know when you've submitted
        your IRA request by clicking the button below. Alternatively, please
        copy or forward the email you send to {emails.hi}.
      </p>

      {status === "ok" ? (
        <p className="mt-6 text-sm inline-flex items-center gap-1.5 text-success-subtle-fg">
          <CircleCheck size={16} />
          Thanks! We'll look out for it.
        </p>
      ) : status === "error" ? (
        <p className="mt-6 text-sm text-destructive-subtle-fg">
          Something went wrong — please email {emails.hi} instead.
        </p>
      ) : (
        <button
          type="button"
          disabled={status === "loading"}
          onClick={async () => {
            set_status("loading");
            try {
              const res = await fetch(href("/api/donation-notifications"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "ira_qcd",
                  recipient_id: id,
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
          className="btn btn-primary rounded w-full mt-6"
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
Payee name: ${LEGAL_NAME}${NEW_LINE}
EIN: ${EIN}${NEW_LINE}
Mailing address: ${ADDRESS}${NEW_LINE}
Reference: ${charity_name} (${profile_url})${NEW_LINE}
Amount: $${amount.toFixed(2)}${NEW_LINE}
${NEW_LINE}
I have copied ${emails.hi} so the donation can be properly recognized and designated. Please let me know if you need any additional information.${NEW_LINE}
${NEW_LINE}
Thank you.`;
