import { EmptyState } from "@better-giving/ui";
import { to_usd } from "@better-giving/ui/helpers";
import { href, Link } from "react-router";
import { admin_page_meta } from "#/routes/admin.$id/page-meta";
import { MAX_EXPIRATION_ISO } from "@/fundraiser/schema";
import type { Route } from "./+types/route";
import { fund_row_status, STATUS_WORD } from "./copy";

export { ErrorBoundary } from "#/components/error";
export { loader } from "./api";

export const meta: Route.MetaFunction = ({ matches }) =>
  admin_page_meta("Campaigns", matches);

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

interface IRow {
  name: string;
  name_to: string;
  meta: string;
  view_to?: string;
  view_label?: string;
}

interface IListedFund {
  id: string;
  name: string;
  active: boolean;
  published: boolean;
  donation_total_usd: number;
  expiration: number;
}

function fund_meta(f: IListedFund) {
  return `${fund_row_status(f)} · ${to_usd(f.donation_total_usd)} raised · ${fund_end(f.expiration)}`;
}

/** an inactive editor only says the fund is closed; assert_fund_editor returns 403 on a fund this org does not own */
function fund_row(f: IListedFund, owned: boolean): IRow {
  const public_to = href("/fundraisers/:fund_id", { fund_id: f.id });
  if (!owned || !f.active) {
    return { name: f.name, name_to: public_to, meta: fund_meta(f) };
  }
  return {
    name: f.name,
    name_to: href("/fundraisers/:fund_id/edit", { fund_id: f.id }),
    meta: fund_meta(f),
    view_to: f.published ? public_to : undefined,
  };
}

function Row({ name, name_to, meta, view_to, view_label }: IRow) {
  return (
    <li className="card grid gap-1">
      <Link to={name_to} className="link font-semibold">
        {name}
      </Link>
      <span className="text-sm text-gray-11">{meta}</span>
      {view_to && (
        <Link
          to={view_to}
          target="_blank"
          rel="noopener noreferrer"
          className="link text-sm"
        >
          {view_label ?? "View"}
        </Link>
      )}
    </li>
  );
}

export default function Page({ loaderData }: Route.ComponentProps) {
  const { endow, campaigns, org_funds, supporter_funds, profile_to } =
    loaderData;
  const profile = endow.slug
    ? `/marketplace/${endow.slug}`
    : `/marketplace/${endow.id}`;
  const new_to = href("/admin/:id/campaigns/new", { id: String(endow.id) });
  const empty =
    campaigns.length === 0 &&
    org_funds.length === 0 &&
    supporter_funds.length === 0;

  return (
    <div className="grid px-6 py-4 md:px-10 md:py-8 gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Campaigns</h1>
        <Link to={new_to} className="btn btn-primary">
          New campaign
        </Link>
      </div>

      <div className="card grid gap-1">
        <p className="text-sm text-gray-11">Better Giving profile</p>
        <Link to={profile} className="link font-semibold">
          {profile}
        </Link>
        <Link to={profile_to} className="link text-sm">
          Edit profile
        </Link>
      </div>

      {empty ? (
        <EmptyState
          action={
            <Link to={new_to} className="btn btn-primary">
              Create campaign
            </Link>
          }
        >
          No campaigns yet
        </EmptyState>
      ) : (
        <>
          {(campaigns.length > 0 || org_funds.length > 0) && (
            <section className="grid gap-3">
              <h2 className="font-semibold">Campaigns</h2>
              <ul className="grid gap-3">
                {campaigns.map((c) => {
                  const public_to =
                    c.status !== "draft" && endow.slug
                      ? href("/org/:org/:campaign", {
                          org: endow.slug,
                          campaign: c.slug,
                        })
                      : undefined;
                  return (
                    <Row
                      key={c.id}
                      name={c.name}
                      name_to={href("/admin/:id/campaigns/:campaign_id", {
                        id: String(endow.id),
                        campaign_id: c.id,
                      })}
                      meta={`${STATUS_WORD[c.status_label]} · ${to_usd(c.raised)} raised · ${when(c.ends_at)}`}
                      view_to={public_to}
                      view_label={public_to}
                    />
                  );
                })}
                {org_funds.map((f) => (
                  <Row key={f.id} {...fund_row(f, true)} />
                ))}
              </ul>
            </section>
          )}
          {supporter_funds.length > 0 && (
            <section className="grid gap-3">
              <h2 className="font-semibold">Supporter fundraisers</h2>
              <ul className="grid gap-3">
                {supporter_funds.map((f) => (
                  <Row key={f.id} {...fund_row(f, false)} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
