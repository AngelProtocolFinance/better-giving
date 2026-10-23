import type { Ref } from "react";
import { Link } from "react-router";
import { BrandBand, is_brand_ground, use_ground } from "./brand-band";
import { raised_summary } from "./raised-stats";

interface IDonateButton {
  /** the donate route; the caller's, never built here */
  to: string;
  /** lg where the boards set Donate large: the hero, the pinned bar */
  size?: "md" | "lg";
  /** the hero's Donate takes one, so the header can tell when it has left */
  ref?: Ref<HTMLAnchorElement>;
  classes?: string;
}

/** the filled Donate. on a brand fill it inverts, since --primary on --primary
 * is no button at all; the inverse has no hover rung of its own */
export function DonateButton({
  to,
  size = "md",
  ref,
  classes = "",
}: IDonateButton) {
  const fill = is_brand_ground(use_ground())
    ? "bg-primary-fg text-primary"
    : "btn-primary";
  return (
    <Link
      ref={ref}
      to={to}
      className={`btn ${fill} ${size === "lg" ? "btn-lg" : ""} ${classes}`}
    >
      Donate
    </Link>
  );
}

export interface IPinnedDonateBar {
  to: string;
  raised: number;
  /** deep: Letter's dark bar */
  tone?: "page" | "deep";
  /** given, the bar stays pinned from md up too, its line led there by the
   * org's name and its Donate a size down: Letter's desktop bar */
  org?: string;
}

/** Donate pinned to the bottom of a phone screen (of every screen, given
 * `org`), with a one-line summary.
 * sticky, not fixed: render it as the last child of the page's full-height
 * root, after the footer, so it rides the viewport's bottom edge and comes to
 * rest under the footer rather than over its last line */
export function PinnedDonateBar({
  to,
  raised,
  tone = "page",
  org,
}: IPinnedDonateBar) {
  const content = (
    <div className="page flex items-center gap-3">
      {/* the name gives way first: the summary is short by construction */}
      <p
        className={`flex min-w-0 flex-1 items-baseline gap-4 text-sm md:text-base ${tone === "page" ? "text-gray-11" : ""}`}
      >
        {org && (
          <strong className="min-w-0 truncate max-md:hidden">{org}</strong>
        )}{" "}
        <span className="shrink-0">{raised_summary(raised)}</span>
      </p>
      <DonateButton to={to} size="lg" classes={org ? "md:btn-md" : ""} />
    </div>
  );
  // the band's fill and the safe-area inset; the gutter is the page's
  const bar = `sticky bottom-0 z-sticky pt-3 pb-(--pin-safe) [--pin-safe:max(calc(var(--spacing)*3),env(safe-area-inset-bottom))] ${org ? "" : "md:hidden"}`;
  if (tone === "deep") {
    return (
      <BrandBand tone="deep" classes={bar}>
        {content}
      </BrandBand>
    );
  }
  return <div className={`${bar} border-t bg-background`}>{content}</div>;
}
