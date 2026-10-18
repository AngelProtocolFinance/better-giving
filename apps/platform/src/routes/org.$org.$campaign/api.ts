import { to_usd } from "@better-giving/ui/helpers";
import { safeParse } from "valibot";
import { get_session } from "#/.server/auth";
import { resp } from "@/helpers/https";
import { frequency } from "@/schemas";
import {
  campaign_accepts,
  campaign_donor_count,
  campaign_public,
} from "$/pg/queries/campaign";
import { npo_get } from "$/pg/queries/npo";
import { reg_public_ein } from "$/pg/queries/registration";
import type { Route } from "./+types/route";

function prefill_amount(raw: string | null) {
  if (!raw) return;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return;
  return String(n);
}

function thanks_from(url: URL): {
  thanks_amount: string | null;
  thanks_name: string | null;
} {
  const raw = url.searchParams.get("donation_amount");
  const amount = raw == null ? Number.NaN : Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { thanks_amount: null, thanks_name: null };
  }
  const currency = url.searchParams.get("donation_currency")?.trim() ?? "";
  const thanks_amount =
    currency === "" || currency.toUpperCase() === "USD"
      ? to_usd(amount)
      : `${amount} ${currency}`;
  const name = url.searchParams.get("donor_name")?.trim() ?? "";
  return { thanks_amount, thanks_name: name === "" ? "You" : name };
}

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const campaign = await campaign_public(params.org, params.campaign);
  if (!campaign || campaign.owner_npo_id == null) throw resp.status(404);
  const [npo, donor_count, registration] = await Promise.all([
    npo_get(campaign.owner_npo_id),
    campaign_donor_count(campaign.id),
    reg_public_ein(campaign.owner_npo_id),
  ]);
  if (!npo || npo.active === false) throw resp.status(404);

  const url = new URL(request.url);
  const amount = prefill_amount(url.searchParams.get("amount"));
  const freq_raw = url.searchParams.get("frequency");
  const freq_parsed = safeParse(frequency, freq_raw);
  const freq_opts = campaign.donate_frequencies ?? undefined;
  const offered = freq_opts ?? ["one-time"];
  const frequency_ok =
    freq_parsed.success && offered.includes(freq_parsed.output)
      ? freq_parsed.output
      : undefined;
  const monthly_default =
    campaign.campaign_type === "monthly" && offered.includes("monthly")
      ? "monthly"
      : undefined;

  const { user } = await get_session(request);
  const now = new Date();
  const thanks = thanks_from(url);
  return {
    campaign,
    npo: {
      id: npo.id,
      name: npo.name,
      donor_address_required: npo.donor_address_required ?? false,
      hide_bg_tip: npo.hide_bg_tip,
      url: npo.url,
      ein: registration?.ein ?? null,
    },
    closed: !campaign_accepts(campaign, now),
    now: now.toISOString(),
    base_url: url.origin,
    canonical: `${url.origin}/org/${params.org}/${params.campaign}`,
    prefill_amount_usd: amount,
    prefill_frequency: frequency_ok ?? monthly_default,
    donor_count,
    ...thanks,
    user: user
      ? {
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
        }
      : undefined,
  };
};
