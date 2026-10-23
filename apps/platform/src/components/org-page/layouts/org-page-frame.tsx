import { type ReactNode, useMemo } from "react";
import { org_href } from "#/helpers/org-href";
import { OrgFooter } from "../footer";
import { type IHeaderSection, OrgHeader } from "../header";
import type { IOrgLayout } from "./types";

interface IOrgPageFrame {
  page: IOrgLayout;
  /** the hero's Donate: the header's waits until it has scrolled away */
  hero_donate: HTMLElement | null;
  /** the hero's phone Donate, where the layout hides `hero_donate` below md
   * and shows this one instead; the header waits on whichever is shown */
  hero_donate_phone?: HTMLElement | null;
  sections?: IHeaderSection[];
  /** the page's main content, hero first */
  children: ReactNode;
}

/** header, main and footer, main filling the screen's height between them */
export function OrgPageFrame({
  page,
  hero_donate,
  hero_donate_phone,
  sections,
  children,
}: IOrgPageFrame) {
  const { npo } = page;
  // stable, so the header's observer is not rebuilt on every render
  const donate_after = useMemo(
    () =>
      hero_donate_phone === undefined
        ? [hero_donate]
        : [hero_donate, hero_donate_phone],
    [hero_donate, hero_donate_phone]
  );
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-gray-12">
      <OrgHeader
        name={npo.name}
        logo={npo.logo}
        to={org_href(npo)}
        bookmark={{ id: npo.id, name: npo.name, logo: npo.logo ?? undefined }}
        share={page.share}
        donate_to={page.donate_to}
        donate_after={donate_after}
        sections={sections}
      />
      <main className="flex flex-1 flex-col">{children}</main>
      <OrgFooter
        name={npo.name}
        logo={npo.logo}
        social_media_urls={npo.social_media_urls}
        details={page.footer}
      />
    </div>
  );
}
