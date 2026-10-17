import { Link, type LinksFunction } from "react-router";
import { richtext_styles } from "#/components/rich-text";
import { ORG_SLUG_PROMPT } from "../admin.$id.campaigns/copy";
import { blank_init, CampaignForm } from "../admin.$id.campaigns/form";
import type { Route } from "./+types/route";

export { ErrorBoundary } from "#/components/error";
export { action, loader } from "./api";
export const links: LinksFunction = () => [...richtext_styles];

export default function Page({ loaderData }: Route.ComponentProps) {
  const { endow, programs, profile_to } = loaderData;
  return (
    <div className="grid px-6 py-4 md:px-10 md:py-8 gap-6 max-w-4xl">
      <h1 className="text-3xl font-bold">New campaign</h1>
      {endow.slug ? (
        <CampaignForm
          init={blank_init(
            endow.donate_methods,
            endow.donate_frequencies,
            endow.hide_bg_tip ?? false
          )}
          programs={programs}
          locked={false}
          status={null}
          gift_count={0}
          fallback_methods={endow.donate_methods}
          fallback_frequencies={endow.donate_frequencies}
        />
      ) : (
        <div className="card grid gap-3">
          <p>{ORG_SLUG_PROMPT}</p>
          <Link to={profile_to} className="btn btn-primary w-fit">
            Organization
          </Link>
        </div>
      )}
    </div>
  );
}
