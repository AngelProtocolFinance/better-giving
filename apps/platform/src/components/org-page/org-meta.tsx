import { ExtLink } from "@better-giving/ui";
import { website_link } from "#/routes/org.$org.$campaign/format";
import type { INpoPublic } from "$/pg/queries/npo";
import { is_brand_ground, use_ground } from "./brand-band";

type TMetaNpo = Pick<INpoPublic, "endow_designation" | "hq_country" | "url">;

interface IOrgMeta {
  npo: TMetaNpo;
  /** eyebrow: Poster, Letter, Feature — small caps over the name, in brand
   * ink on a light ground. plain: Hub's line under the name */
  variant: "eyebrow" | "plain";
  classes?: string;
}

/** designation · country · website, the website named by its host alone.
 * "Other" is no designation and is left out, as is a missing website. each
 * fact is its own list item; the dots are drawn between them and never read */
export function OrgMeta({ npo, variant, classes = "" }: IOrgMeta) {
  const brand = is_brand_ground(use_ground());
  const website = website_link(npo.url);
  const facts = [
    npo.endow_designation !== "Other" && {
      key: "designation",
      node: npo.endow_designation,
    },
    npo.hq_country && { key: "country", node: npo.hq_country },
    website && {
      key: "website",
      node: (
        <ExtLink
          href={website.href}
          // on a brand fill the ink is the band's and there is no hover rung
          className={`underline underline-offset-4 ${brand ? "" : "link"}`}
        >
          {website.label}
        </ExtLink>
      ),
    },
  ].filter((f) => !!f);
  if (facts.length === 0) return null;

  const look =
    variant === "eyebrow"
      ? `text-xs font-bold uppercase tracking-badge md:text-sm ${brand ? "" : "text-primary"}`
      : "text-sm font-semibold";
  return (
    <ul
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${look} ${classes}`}
    >
      {facts.map((fact, i) => (
        <li key={fact.key} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden>·</span>}
          {fact.node}
        </li>
      ))}
    </ul>
  );
}
