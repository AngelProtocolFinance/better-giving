import { ADDRESS, EIN, LEGAL_NAME } from "@better-giving/brand";
import { flat_colors } from "@better-giving/brand/flat";
import { type CSSProperties, Fragment } from "react";
import { Text } from "react-email";
import { Link } from "../components/link";
import { PlatformLayout } from "../components/platform-layout";

/**
 * service notice that the nonprofit terms have been revised.
 * the merge field and the bracketed placeholders stay literal until a send
 * fills them. nothing here sends mail — render the static files with
 * `pnpm --filter emails render:npo-terms-notice`.
 */

export const NPO_NAME = "{{npo_name}}";
export const EFFECTIVE_DATE = "[EFFECTIVE DATE]";
export const TERMS_URL = "[TERMS URL]";
export const SUPPORT_EMAIL = "[SUPPORT EMAIL]";

const EARLIER_TERMS_URL = "https://better.giving/terms-of-use-npo-2024";

/** the legal line under the service notice, from the brand identity */
const FOOTER_IDENTITY = `${LEGAL_NAME} \u00B7 ${ADDRESS} \u00B7 EIN ${EIN}`;

export interface IData {
  /** ZeptoMail merge field. default is the literal `{{npo_name}}` */
  npo_name?: string;
  /** default is the literal `[EFFECTIVE DATE]` */
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
}

type TBlockKind = "body" | "label" | "signoff" | "footer";

interface IBlock {
  kind: TBlockKind;
  lines: string[];
}

const fields_of = (data: IData = {}): IFields => ({
  npo_name: data.npo_name ?? NPO_NAME,
  effective_date: data.effective_date ?? EFFECTIVE_DATE,
  terms_url: data.terms_url ?? TERMS_URL,
  support_email: data.support_email ?? SUPPORT_EMAIL,
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
      `We have posted revised Better Giving Terms for Nonprofits and Referral Program Terms. The revised terms take effect at 12:00 a.m. Eastern Time on ${f.effective_date}.`,
    ],
  },
  { kind: "label", lines: ["What changes:"] },
  {
    kind: "body",
    lines: [
      "- Recovering reversed donations: If a donation we already granted to you is refunded, reversed or charged back, we may deduct the granted part from your future grants, plus the card/payment processing fees and any dispute fee we paid on it. On a partial refund you owe only the same share. We tell you each amount before we deduct it. If the reversed part is still in your Savings or Investment balance, or in an unpaid grant, we may take it back from there or cancel that grant instead. When a donor opens a dispute, we may treat the disputed amount as reversed straight away. If we win, the donor withdraws, or the payment isn't reversed, we cancel the amount and return anything taken back. If the dispute is reopened and the donor keeps the money, the amount applies again.",
      "- Amounts left owing: If your grants don't cover an amount, it stays owed. If you leave the platform, the agreement ends, or no grant is due within 90 days of our notice, we may invoice you, payable within 30 days, or collect it by other lawful means. We may waive any amount. These recovery duties continue after you leave the platform or the agreement ends.",
      `- Older donations aren't affected: The recovery rules above apply only to donations made on or after ${f.effective_date}. For referral partners: if a donation is refunded, reversed or disputed after the referral reward was paid, we may deduct that reward from later referral payments. This applies to donations made on or after ${f.effective_date}.`,
      "- Receipts, refunds and donor information: Better Giving receives every donation and issues the donor's receipt. You must not issue your own receipt or describe a platform donation as a gift to your organization. You may still thank donors. Use the donor details we share only to thank donors and to share reasonable information about your work. Better Giving may refund all or part of a donation. Refunded amounts aren't charitable contributions, and we issue a corrected receipt when a donor asks.",
      "- Fees and liability: The terms now list every fee, including payment processing fees deducted before a donation is allocated. There are no other fees. The $100 liability cap doesn't limit amounts we owe you, such as a grant deducted in error.",
      "- Notice of changes: Future changes take effect 7 days after we post them, unless the posting gives a later date.",
    ],
  },
  {
    kind: "body",
    lines: [
      `Read the full terms: ${f.terms_url}`,
      `Earlier version (October 2024): ${EARLIER_TERMS_URL}`,
    ],
  },
  {
    kind: "body",
    lines: [
      `Acceptance: If you keep using Better Giving as a nonprofit after ${f.effective_date}, you accept the revised terms. If you don't accept them, you may end the agreement under Section 8.`,
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
export const plain_body = (data: IData = {}): string =>
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
  const bullet = line.match(/^(- )([^:]+:)([\s\S]*)$/);
  if (bullet) {
    return (
      <>
        {bullet[1]}
        <strong>{bullet[2]}</strong>
        <LineText line={bullet[3]} links={links} />
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
  const links = [f.terms_url, EARLIER_TERMS_URL].filter(is_http);
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

export const template = (data: IData = {}) => {
  const fields = fields_of(data);
  return {
    node: <Jsx {...fields} />,
    subject: subject_line(fields.effective_date),
  };
};
