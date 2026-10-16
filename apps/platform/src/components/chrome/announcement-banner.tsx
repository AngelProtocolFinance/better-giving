import { XIcon } from "lucide-react";
import { useState } from "react";
import { href, Link } from "react-router";

// the campaign id appears as a bare literal in five places: this key, the
// `data-banner` attribute, the `dataset.bannerDismissed` write, the tailwind
// arbitrary variant, and the pre-paint script in root-layout.tsx. two of those
// genuinely cannot be interpolated — tailwind's scanner needs the class
// literal, and the head script must stay a static string — so the drift is
// caught by a test instead: announcement-banner.test.tsx reads root-layout's
// source and asserts it still contains this exact key.
export const KEY = "banner:ncnp-endorsement";

// single literal for the post the bar links to. public-layout suppresses the
// bar on this same post via `href("/blog/:slug", { slug: BANNER_POST_SLUG })`
// — a second copy of the slug there would let a rename silently break the
// suppression and render the bar atop the article as a self-link.
export const BANNER_POST_SLUG = "setting-a-new-standard-for-digital-giving";

/**
 * dismissible marketing announcement bar. the caller decides *whether* to
 * render it (chrome gate + suppress-on-target-page); it takes no styling
 * props.
 *
 * markup always renders — server included. a pre-paint script in the root
 * layout sets `<html data-banner-dismissed="ncnp-endorsement">` from the
 * localStorage key, and the arbitrary variant below empties the bar before it
 * ever paints. gating the first render on a mount effect would shift the
 * layout of every marketing page instead.
 *
 * both dismissal paths — react state and the css variant — act on the *inner*
 * container, never the outer one. callers place this as its own grid row
 * (see PublicLayout), and grid auto-placement assigns tracks to boxes: an
 * outer element that stopped generating a box would slide the header and
 * outlet up a track each. an empty outer element in an `auto` track is 0px,
 * which is what collapsing is supposed to mean here. the landmark is the inner
 * container, so a dismissed bar leaves no empty "Announcement" region behind.
 *
 * the dismiss button unmounts with the bar, so `on_dismissed` is where the
 * caller puts focus next.
 */
interface IAnnouncementBanner {
  on_dismissed: () => void;
}

export function AnnouncementBanner({ on_dismissed }: IAnnouncementBanner) {
  const [dismissed, set_dismissed] = useState(false);

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // storage blocked (private mode / cookie policy) — the bar still closes
      // for this session, it just comes back on the next load.
    }
    document.documentElement.dataset.bannerDismissed = "ncnp-endorsement";
    set_dismissed(true);
    on_dismissed();
  };

  return (
    <div data-banner="ncnp-endorsement" className="surface-deep print:hidden">
      {/* the row is full-bleed, bounded by the gutter rather than a
          max-width: capping the column made the sentence wrap with the bar
          half empty. `px-5 md:px-10` is the gutter `page` gives the marketing
          header's row, so their content edges line up. */}
      {!dismissed && (
        <aside
          aria-label="Announcement"
          className="flex items-start gap-2 px-5 md:px-10 py-2 [html[data-banner-dismissed='ncnp-endorsement']_&]:hidden"
        >
          {/* only the visible "Find out more" text is the link — the sentence
              around it is plain text, so hovering or clicking the rest of the
              bar does nothing. */}
          {/* surface-deep's ink set: the headline sentence and the link in
              full white, the rest in its secondary step. the link keeps the
              contrast ink and a hover underline — a link on a brand ground
              has no measured hover ink (ledger → the link primitive). */}
          <p className="flex-1 text-center text-2xs leading-relaxed text-balance text-blue-5 sm:text-xs">
            <span className="font-medium text-primary-fg">
              Setting a new standard for digital giving.
            </span>{" "}
            Better Giving endorses the National Council for Nonprofits
            Principles for Ethical Online Fundraising.{" "}
            <Link
              to={href("/blog/:slug", { slug: BANNER_POST_SLUG })}
              className="font-bold text-primary-fg whitespace-nowrap hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              Find out more →
            </Link>
          </p>
          {/* the dismiss button stays outside the link's subtree — a <button>
              inside an <a> is invalid markup and its click would bubble into
              the navigation. min-*-11 is the 44px hit area. -me-2.5 keeps the
              glyph on the gutter edge the 24px box put it on; -my-2 spends the
              row's own padding on it, so a one-line bar is exactly the 44px
              target tall rather than clipping it under the header. */}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss announcement"
            className="glyph-btn min-w-11 min-h-11 -my-2 -me-2.5 text-blue-5 hover:text-primary-fg focus-visible:text-primary-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <XIcon className="icon-md" />
          </button>
        </aside>
      )}
    </div>
  );
}
