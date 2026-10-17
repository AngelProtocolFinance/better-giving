import { safeParse } from "valibot";
import { get_session } from "#/.server/auth";
import { resp } from "@/helpers/https";
import { frequency } from "@/schemas";
import { campaign_accepts, campaign_public } from "$/pg/queries/campaign";
import { npo_get } from "$/pg/queries/npo";
import type { Route } from "./+types/route";

function prefill_amount(raw: string | null) {
  if (!raw) return;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return;
  return String(n);
}

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const campaign = await campaign_public(params.org, params.campaign);
  if (!campaign || campaign.owner_npo_id == null) throw resp.status(404);
  const npo = await npo_get(campaign.owner_npo_id);
  if (!npo || npo.active === false) throw resp.status(404);

  const url = new URL(request.url);
  const amount = prefill_amount(url.searchParams.get("amount"));
  const freq_raw = url.searchParams.get("frequency");
  const freq_parsed = safeParse(frequency, freq_raw);
  const freq_opts = campaign.donate_frequencies ?? undefined;
  const frequency_ok =
    freq_parsed.success &&
    (freq_opts ?? ["one-time"]).includes(freq_parsed.output)
      ? freq_parsed.output
      : undefined;

  const { user } = await get_session(request);
  const now = new Date();
  return {
    campaign,
    npo: {
      id: npo.id,
      name: npo.name,
      donor_address_required: npo.donor_address_required ?? false,
    },
    closed: !campaign_accepts(campaign, now),
    now: now.toISOString(),
    base_url: url.origin,
    canonical: `${url.origin}/org/${params.org}/${params.campaign}`,
    prefill_amount_usd: amount,
    prefill_frequency: frequency_ok,
    user: user
      ? {
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
        }
      : undefined,
  };
};
