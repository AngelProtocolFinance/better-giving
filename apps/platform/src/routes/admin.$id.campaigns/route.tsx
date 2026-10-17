import { to_usd } from "@better-giving/ui/helpers";
import { href, Link } from "react-router";
import { MAX_EXPIRATION_ISO } from "@/fundraiser/schema";
import type { Route } from "./+types/route";

export { ErrorBoundary } from "#/components/error";
export { loader } from "./api";

const NO_END_MS = Date.parse(MAX_EXPIRATION_ISO);

function when(iso: string | null) {
  if (!iso) return "No end date";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** fund search docs store expiration as unix seconds; the year-9999 sentinel is no end date */
function fund_end(expiration: number) {
  if (expiration * 1000 >= NO_END_MS) return "No end date";
  return when(new Date(expiration * 1000).toISOString());
}

export default function Page({ loaderData }: Route.ComponentProps) {
  const { endow, campaigns, funds, profile_to } = loaderData;
  const profile = endow.slug
    ? `/marketplace/${endow.slug}`
    : `/marketplace/${endow.id}`;

  return (
    <div className="grid px-6 py-4 md:px-10 md:py-8 gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Campaigns</h1>
        <Link
          to={href("/admin/:id/campaigns/new", { id: String(endow.id) })}
          className="btn btn-primary"
        >
          New campaign
        </Link>
      </div>

      <Link to={profile_to} className="card block">
        <p className="text-sm text-gray-11">Better Giving profile</p>
        <p className="mt-1 font-semibold">{profile}</p>
      </Link>

      <ul className="grid gap-3">
        {campaigns.map((c) => (
          <li key={c.id}>
            <Link
              to={href("/admin/:id/campaigns/:campaign_id", {
                id: String(endow.id),
                campaign_id: c.id,
              })}
              className="card grid gap-1"
            >
              <span className="font-semibold">{c.name}</span>
              <span className="text-sm text-gray-11">
                {c.status} · {to_usd(c.raised)} raised · {when(c.ends_at)}
              </span>
            </Link>
          </li>
        ))}
        {funds.map((f) => (
          <li key={f.id} className="card grid gap-1">
            <Link
              to={href("/fundraisers/:fund_id", { fund_id: f.id })}
              className="link font-semibold"
            >
              {f.name}
            </Link>
            <span className="text-sm text-gray-11">
              {f.active ? (f.published ? "live" : "draft") : "ended"} ·{" "}
              {to_usd(f.donation_total_usd)} raised · {fund_end(f.expiration)}
            </span>
            <Link
              to={href("/fundraisers/:fund_id/edit", { fund_id: f.id })}
              className="link text-sm"
            >
              Edit
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
