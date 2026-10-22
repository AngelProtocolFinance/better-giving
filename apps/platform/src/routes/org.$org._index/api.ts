import { href } from "react-router";
import { get_funds_npo_memberof } from "#/.server/funds";
import { report_error } from "#/errors/report";
import { moved } from "#/helpers/moved";
import { org_href } from "#/helpers/org-href";
import { npo_id } from "#/pages/marketplace/npo-id";
import { campaign_live_for_npo } from "$/pg/queries/campaign";
import { donation_message_list } from "$/pg/queries/donation-message";
import {
  npo_by_slug,
  npo_donor_count,
  npo_get,
  npo_public,
} from "$/pg/queries/npo";
import { npo_media_list } from "$/pg/queries/npo-media";
import { npo_programs } from "$/pg/queries/program";
import type { Route } from "./+types/route";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

/** the profile shows up to this many featured videos */
export const MAX_VIDEOS = 4;

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const id = npo_id(params.org);
  const npo = await (typeof id === "number" ? npo_get(id) : npo_by_slug(id));
  if (!npo || npo.active === false) throw new Response(null, { status: 404 });
  // an org with a slug lives at it; its id url is an alias
  if (typeof id === "number" && npo.slug) {
    throw moved(`${org_href(npo)}${new URL(request.url).search}`);
  }

  // a rejected deferred streams to <Await errorElement> and never reaches handleError
  const reported = <T>(deferred: Promise<T>) =>
    deferred.catch((err) => {
      report_error(err, { endow_id: npo.id });
      throw err;
    });

  const [campaigns, donors, messages] = await Promise.all([
    campaign_live_for_npo(npo.id),
    npo_donor_count(npo.id).catch((err) => {
      report_error(err, { endow_id: npo.id });
      return null;
    }),
    donation_message_list(String(npo.id), { limit: 10 })
      .then((page) =>
        page.items
          .filter((m) => m.donor_message?.trim())
          .map((m) => ({
            id: m.id,
            name: m.donor_name || "Donor",
            message: m.donor_message as string,
          }))
      )
      .catch((err) => {
        report_error(err, { endow_id: npo.id });
        return [];
      }),
  ]);

  return {
    npo: npo_public(npo),
    url: new URL(org_href(npo), request.url).toString(),
    donors,
    messages,
    // a campaign page lives under its org's slug
    campaigns: campaigns
      .flatMap((c) => (c.owner_slug ? [c] : []))
      .map((c) => ({
        id: c.id,
        name: c.name,
        to: href("/org/:org/:campaign", {
          org: c.owner_slug as string,
          campaign: c.slug,
        }),
        image: c.hero ?? null,
        raised: c.raised,
        target: c.target,
      })),

    //lazy
    funds: reported(get_funds_npo_memberof(npo.id, { published: true })),
    media: reported(
      npo_media_list(npo.id, {
        type: "video",
        featured: true,
        limit: MAX_VIDEOS,
      }).then((x) => x.items)
    ),
    programs: reported(npo_programs(npo.id)),
  };
};
