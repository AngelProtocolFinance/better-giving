import { Image } from "@better-giving/ui";
import { to_usd } from "@better-giving/ui/helpers";
import { href, Link } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { OrgFooter } from "#/components/org-page/footer";
import { GoalBar } from "#/components/org-page/goal-bar";
import { OrgHeader } from "#/components/org-page/header";
import { RichText, richtext_styles, to_text } from "#/components/rich-text";
import { app_name } from "#/constants/env";
import { org_href } from "#/helpers/org-href";
import { metas } from "#/helpers/seo";
import { Share } from "#/routes/_app.fundraisers.$fund_id/share";
import type { Route } from "./+types/route";
import { Milestones } from "./milestones";

export { ErrorBoundary } from "#/components/error";
export { headers, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const links: Route.LinksFunction = () => [...richtext_styles];
export const meta: Route.MetaFunction = ({ loaderData: d }) => {
  if (!d) return [];
  return metas({
    title: `${d.prog.title} - ${d.npo.name} - ${app_name}`,
    description: to_text(d.prog.description_pt).slice(0, 140),
    name: d.prog.title,
    image: d.prog.banner ?? undefined,
    url: d.url,
  });
};

export default CacheRoute(Page);
function Page({ loaderData: d }: Route.ComponentProps) {
  const { npo, prog } = d;
  const donate_to = `${href("/donate/:id", { id: String(npo.id) })}?programId=${prog.id}`;
  const target = prog.target_raise ?? 0;
  const received = prog.total_donations ?? 0;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-gray-12">
      <OrgHeader name={npo.name} logo={npo.logo} to={org_href(npo)} />
      <main className="page flex flex-1 flex-col gap-7 pt-6 pb-28 lg:pb-20">
        {prog.banner && (
          <Image
            src={prog.banner}
            alt=""
            className="aspect-3/1 w-full rounded object-cover"
          />
        )}
        <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="flex min-w-0 flex-col gap-12">
            <section className="flex flex-col gap-4">
              <p className="text-sm font-bold uppercase tracking-badge text-gray-11">
                Program
              </p>
              <h1 className="text-3xl font-bold break-words sm:text-4xl">
                {prog.title}
              </h1>
              <RichText
                readOnly
                content={{ value: prog.description_pt }}
                classes={{ field: "w-full text-base leading-relaxed" }}
              />
            </section>
            <Milestones milestones={prog.milestones} />
          </div>
          <aside className="flex flex-col gap-2">
            {target > 0 && (
              <div className="card flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-3xl font-bold">{to_usd(received)}</p>
                  <p className="text-gray-11">of {to_usd(target)} target</p>
                </div>
                <GoalBar
                  raised={received}
                  goal={target}
                  label="Amount received"
                />
              </div>
            )}
            <Link to={donate_to} className="btn btn-primary max-lg:hidden">
              Donate to this program
            </Link>
            <Share
              trigger="button"
              classes="max-lg:hidden"
              recipientName={prog.title}
              url={d.url}
            />
          </aside>
        </div>
      </main>
      <OrgFooter
        name={npo.name}
        logo={npo.logo}
        social_media_urls={npo.social_media_urls}
      />
      <div className="fixed inset-x-0 bottom-0 z-sticky flex gap-2 border-t bg-panel px-4 py-3 lg:hidden">
        <Link to={donate_to} className="btn btn-primary min-w-0 flex-1">
          Donate to this program
        </Link>
      </div>
    </div>
  );
}
