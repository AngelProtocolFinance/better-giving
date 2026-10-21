import { EmptyState, TabPanel, Tabs } from "@better-giving/ui";
import { to_usd } from "@better-giving/ui/helpers";
import { href, Link, useSearchParams } from "react-router";
import { admin_page_meta } from "#/routes/admin.$id/page-meta";
import { FundsList } from "#/routes/admin.$id.funds/list";
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
  edit_to?: string;
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

/** a closed fund has no editor; the public page is the view link */
function fund_row(f: IListedFund): IRow {
  const public_to = href("/fundraisers/:fund_id", { fund_id: f.id });
  if (!f.active) {
    return { name: f.name, meta: fund_meta(f), view_to: public_to };
  }
  return {
    name: f.name,
    edit_to: href("/fundraisers/:fund_id/edit", { fund_id: f.id }),
    meta: fund_meta(f),
    view_to: f.published ? public_to : undefined,
  };
}

function Row({ name, edit_to, meta, view_to, view_label }: IRow) {
  return (
    <li className="card grid gap-1">
      <p className="font-semibold">{name}</p>
      <span className="text-sm text-gray-11">{meta}</span>
      {(edit_to || view_to) && (
        <div className="flex flex-wrap items-center gap-3">
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
          {edit_to && (
            <Link className="btn btn-secondary" to={edit_to}>
              Edit
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

export default function Page({ loaderData }: Route.ComponentProps) {
  const [params, setParams] = useSearchParams();
  const tab = loaderData.view;
  const { endow } = loaderData;
  const profile = endow.slug
    ? `/marketplace/${endow.slug}`
    : `/marketplace/${endow.id}`;
  const new_to = href("/admin/:id/campaigns/new", { id: String(endow.id) });

  return (
    <div className="grid px-6 py-4 md:px-10 md:py-8 gap-6 max-w-[1400px]">
      <h1 className="text-3xl font-bold">Campaigns</h1>
      <Tabs
        className="grid gap-6"
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          if (value === "fundraisers") next.set("tab", "fundraisers");
          else next.delete("tab");
          setParams(next, { preventScrollReset: true });
        }}
        items={[
          { value: "campaigns", label: "Your campaigns" },
          { value: "fundraisers", label: "Supporter fundraisers" },
        ]}
      >
        {loaderData.view === "campaigns" ? (
          <TabPanel value="campaigns" className="grid gap-6">
            <Link to={new_to} className="btn btn-primary justify-self-end">
              New campaign
            </Link>
            <div className="card grid gap-1">
              <p className="text-sm text-gray-11">Better Giving profile</p>
              <Link to={profile} className="link font-semibold">
                {profile}
              </Link>
              <Link to={loaderData.profile_to} className="link text-sm">
                Edit profile
              </Link>
            </div>
            {loaderData.campaigns.length === 0 &&
            loaderData.org_funds.length === 0 ? (
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
              <ul className="grid gap-3">
                {loaderData.campaigns.map((c) => {
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
                      edit_to={href("/admin/:id/campaigns/:campaign_id", {
                        id: String(endow.id),
                        campaign_id: c.id,
                      })}
                      meta={`${STATUS_WORD[c.status_label]} · ${to_usd(c.raised)} raised · ${when(c.ends_at)}`}
                      view_to={public_to}
                      view_label={public_to}
                    />
                  );
                })}
                {loaderData.org_funds.map((f) => (
                  <Row key={f.id} {...fund_row(f)} />
                ))}
              </ul>
            )}
          </TabPanel>
        ) : (
          <TabPanel value="fundraisers" className="grid gap-6">
            <FundsList
              funds={loaderData.funds}
              endow_id={endow.id}
              platform_admin={loaderData.user.role === "admin"}
            />
          </TabPanel>
        )}
      </Tabs>
    </div>
  );
}
