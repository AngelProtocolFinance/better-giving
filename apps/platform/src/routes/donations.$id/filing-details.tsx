import { ADDRESS, EIN, LEGAL_NAME } from "@better-giving/brand";
import { BuildingIcon, CheckCircle2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { Form, useFetcher } from "react-router";
import { useRemixForm } from "remix-hook-form";
import { Copier } from "#/components/copier";
import { to_utc_day } from "@/helpers/date";
import { humanize } from "@/helpers/decimal";
import type { IFiledFv } from "./schema";

interface IFilingDetails {
  /** iso date the donation was made */
  date: string;
  /** donation amount, in `currency` */
  amount: number;
  currency: string;
  /** public url of this donation page — the donor's record of the gift */
  record_url: string;
  /** the donor already told us they filed; self-reported, never confirmed */
  filed?: boolean;
  classes?: string;
}

/**
 * the paperwork an employer's matching-gift form asks for. shown to every
 * donor: the payload is ours (legal name, EIN, address) plus the donation's own
 * date and amount, so it's identical for everyone and independent of which
 * employer — if any — the donor works for. asserts nothing about any specific
 * employer's programme; we have no employer data and make no promises about one.
 */
export function FilingDetails({ classes = "", ...p }: IFilingDetails) {
  return (
    <section
      className={`w-full border bg-card rounded overflow-hidden ${classes}`}
    >
      <div className="flex items-start gap-x-2 p-4">
        <span className="h-lh flex items-center shrink-0">
          <BuildingIcon className="stroke-primary" size={16} />
        </span>
        <div>
          <h3 className="text-sm font-semibold">
            Ask your employer to match this gift
          </h3>
          <p className="text-sm text-muted-fg mt-1">
            If your employer runs a matching gift program, filing takes a few
            minutes. Better Giving is the 501(c)(3) that received your donation,
            so these are the details the form will ask for.
          </p>
        </div>
      </div>
      <dl className="grid sm:grid-cols-[auto_auto_1fr] border-t">
        <Row label="Recipient legal name" value={LEGAL_NAME} />
        <Row label="EIN (tax ID)" value={EIN} />
        <Row label="Mailing address" value={ADDRESS} />
        <Row label="Donation date" value={to_utc_day(p.date)} />
        <Row
          label="Donation amount"
          value={`${humanize(p.amount)} ${p.currency.toUpperCase()}`}
        />
        <Row label="Record of this gift" value={p.record_url} last>
          <span className="break-all">{p.record_url}</span>
        </Row>
      </dl>
      <p className="text-sm text-muted-fg p-4 border-t">
        Not sure where to file? Check your employer's giving portal, or forward
        these details to your HR team.
      </p>
      <div className="p-4 border-t">
        <FiledBtn filed={p.filed} />
      </div>
    </section>
  );
}

interface IFiledBtn {
  filed?: boolean;
}

/**
 * the donor telling us they filed — the only signal we will ever get. employers
 * verify a gift with the charity, they never report back, so nothing else can
 * mark this.
 *
 * a POST and nothing else. the filing pack mails a link to this page, and
 * corporate mail security prefetches inbound urls before the recipient ever
 * opens them — a GET link, or a stamp written on load, would file claims for
 * donors who never clicked.
 */
function FiledBtn({ filed }: IFiledBtn) {
  const fetcher = useFetcher({ key: "donation" });
  const { handleSubmit } = useRemixForm<IFiledFv>({
    fetcher,
    defaultValues: { type: "filed" },
  });

  if (filed) {
    return (
      <p className="flex items-start gap-x-2 text-sm">
        <span className="h-lh flex items-center shrink-0">
          <CheckCircle2Icon className="stroke-success" size={16} />
        </span>
        <span>
          <span className="font-semibold">You told us you filed this.</span>{" "}
          <span className="text-muted-fg">
            We'll expect your employer's verification request and answer it.
          </span>
        </span>
      </p>
    );
  }

  return (
    <Form onSubmit={handleSubmit} method="POST" className="grid">
      <p className="text-sm text-muted-fg">
        Filed it already? Tell us, so we know to expect your employer's
        verification request.
      </p>
      <button
        disabled={fetcher.state !== "idle"}
        type="submit"
        className="btn btn-secondary text-sm px-4 py-2 rounded mt-4 justify-self-end"
      >
        I filed this with my employer
      </button>
    </Form>
  );
}

interface IRow {
  label: string;
  /** the copyable text; also the rendered value unless `children` overrides it */
  value: string;
  children?: ReactNode;
  last?: boolean;
}

function Row({ label, value, children, last }: IRow) {
  return (
    <>
      <dt className="px-4 max-sm:pt-3 sm:p-3 flex items-center text-xs font-semibold uppercase text-muted-fg">
        {label}
      </dt>
      <div
        aria-hidden={true}
        className="max-sm:hidden w-px border-r last:border-none"
      />
      <dd className="px-4 max-sm:pb-3 sm:p-3 flex items-center gap-x-2 text-sm">
        {children ?? value}
        <Copier
          text={value}
          classes={{
            container: "text-muted-fg hover:text-fg shrink-0",
            icon: "size-4",
          }}
          size={16}
        />
      </dd>
      {!last && (
        <div aria-hidden={true} className="h-px col-span-full border-b" />
      )}
    </>
  );
}
