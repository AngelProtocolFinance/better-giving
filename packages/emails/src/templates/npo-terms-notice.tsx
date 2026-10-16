import { ADDRESS, EIN, LEGAL_NAME } from "@better-giving/brand";
import { flat_colors } from "@better-giving/brand/flat";
import { type CSSProperties, Fragment } from "react";
import { Text } from "react-email";
import { Link } from "../components/link";
import { PlatformLayout } from "../components/platform-layout";

/**
 * service notice that the nonprofit terms have been revised.
 * `{{npo_name}}`, `[TERMS URL]`, and `[SUPPORT EMAIL]` stay literal until a
 * send fills them. the effective date is October 23, 2026. nothing here sends
 * mail — render the static files with
 * `pnpm --filter emails render:npo-terms-notice`.
 */

export const NPO_NAME = "{{npo_name}}";
export const EFFECTIVE_DATE = "October 23, 2026";
export const TERMS_URL = "[TERMS URL]";
export const SUPPORT_EMAIL = "[SUPPORT EMAIL]";

/** the legal line under the service notice, from the brand identity */
const FOOTER_IDENTITY = `${LEGAL_NAME} \u00B7 ${ADDRESS} \u00B7 EIN ${EIN}`;

export interface IData {
  /** the sending environment's origin, no trailing slash; every app link is built on it */
  base_url: string;
  /** ZeptoMail merge field. default is the literal `{{npo_name}}` */
  npo_name?: string;
  /** default is October 23, 2026, the day the revised terms take effect */
  effective_date?: string;
  /** default is the literal `[TERMS URL]` */
  terms_url?: string;
  /** default is the literal `[SUPPORT EMAIL]` */
  support_email?: string;
}

interface IFields {
  npo_name: string;
  effective_date: string;
  terms_url: string;
  support_email: string;
  earlier_terms_url: string;
}

type TBlockKind = "body" | "label" | "signoff" | "footer";

interface IBlock {
  kind: TBlockKind;
  lines: string[];
}

const fields_of = (data: IData): IFields => ({
  npo_name: data.npo_name ?? NPO_NAME,
  effective_date: data.effective_date ?? EFFECTIVE_DATE,
  terms_url: data.terms_url ?? TERMS_URL,
  support_email: data.support_email ?? SUPPORT_EMAIL,
  earlier_terms_url: `${data.base_url}/terms-of-use-npo-2024`,
});

export const subject_line = (effective_date: string): string =>
  `Updates to the Better Giving Terms for Nonprofits \u2013 effective ${effective_date}`;

const service_notice = (npo_name: string): string =>
  `You are receiving this service notice because you are an administrator of ${npo_name} on Better Giving. This is a required account notice, not a marketing message.`;

const paragraphs = (f: IFields): IBlock[] => [
  { kind: "body", lines: [`Hello ${f.npo_name} team,`] },
  {
    kind: "body",
    lines: [
      `We've updated the Better Giving Terms for Nonprofits and Referral Program Terms. The changes take effect at 12:00 a.m. Eastern Time on ${f.effective_date}.`,
    ],
  },
  { kind: "label", lines: ["The highlights:"] },
  {
    kind: "body",
    lines: [
      `1. Refunds and chargebacks: If a donation we already granted to you is later refunded or charged back, we may recover that amount and its related fees from future grants. We'll always tell you the amount before we deduct it, and if we win a dispute, we return it. This applies only to donations made on or after ${f.effective_date}.`,
      "2. Receipts and donor details: Better Giving receives each donation and issues the donor's tax receipt, so please don't issue your own. You're always welcome to thank your donors. Use donor details only to thank donors and share news about your work.",
      "3. Fees: The terms now list every fee in one place.",
      "4. Future changes: Future updates take effect 7 days after we post them, unless the update states a later date.",
      `5. Referral partners: If we've already paid a referral reward on a donation that's later refunded or charged back, we may deduct it from future referral payments. This applies to donations made on or after ${f.effective_date}.`,
    ],
  },
  {
    kind: "body",
    lines: [
      `Read the full terms: ${f.terms_url}`,
      `Earlier version (October 2024): ${f.earlier_terms_url}`,
    ],
  },
  {
    kind: "body",
    lines: [
      `If you keep using Better Giving after ${f.effective_date}, you accept the revised terms. If you don't accept them, you may end the agreement under Section 8.`,
    ],
  },
  { kind: "body", lines: [`Questions? Contact ${f.support_email}.`] },
  { kind: "signoff", lines: ["The Better Giving team"] },
  {
    kind: "footer",
    lines: ["--", service_notice(f.npo_name), FOOTER_IDENTITY],
  },
];

/** the plain-text body, same words the html renders */
export const plain_body = (data: IData): string =>
  paragraphs(fields_of(data))
    .map((block) => block.lines.join("\n"))
    .join("\n\n");

const block_style = (kind: TBlockKind): CSSProperties | undefined => {
  switch (kind) {
    case "label":
      return { fontWeight: 600 };
    case "signoff":
      return { margin: 0, fontWeight: 600, color: flat_colors.primary };
    case "footer":
      return {
        fontSize: 13,
        lineHeight: "20px",
        color: flat_colors.gray_11,
        marginBottom: 0,
      };
    default:
      return undefined;
  }
};

const is_http = (value: string): boolean => /^https?:\/\//.test(value);

interface ILineProps {
  line: string;
  links: readonly string[];
}

/**
 * a `https` value is a link whose text is the url, so the plain-text part
 * stays the same words. a bracketed placeholder is not a url and stays text —
 * linking it makes the text part print the token twice.
 */
function LineText({ line, links }: ILineProps) {
  const item = line.match(/^(\d+\. )([^:]+:)([\s\S]*)$/);
  if (item) {
    return (
      <>
        {item[1]}
        <strong>{item[2]}</strong>
        <LineText line={item[3]} links={links} />
      </>
    );
  }

  const link = links.find((href) => line.includes(href));
  if (!link) return line;

  const at = line.indexOf(link);
  return (
    <>
      {line.slice(0, at)}
      <Link href={link}>{link}</Link>
      <LineText line={line.slice(at + link.length)} links={links} />
    </>
  );
}

function Jsx(f: IFields) {
  // longest first: a shorter url must not match as a prefix of a longer one
  const links = [f.terms_url, f.earlier_terms_url]
    .filter(is_http)
    .sort((a, b) => b.length - a.length);
  return (
    <PlatformLayout title={subject_line(f.effective_date)}>
      {paragraphs(f).map((block) => (
        <Text key={block.lines[0]} style={block_style(block.kind)}>
          {block.lines.map((line, index) => (
            <Fragment key={line}>
              {index > 0 && <br />}
              <LineText line={line} links={links} />
            </Fragment>
          ))}
        </Text>
      ))}
    </PlatformLayout>
  );
}

export const template = (data: IData) => {
  const fields = fields_of(data);
  return {
    node: <Jsx {...fields} />,
    subject: subject_line(fields.effective_date),
  };
};
