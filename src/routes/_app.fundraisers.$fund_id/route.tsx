import { ArrowLeft } from "lucide-react";
import { href, Link, NavLink } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import flying_character from "#/assets/images/flying-character.webp";
import { DonorMsgs } from "#/components/donor-msgs";
import { FundCreator, FundStatus, status_fn } from "#/components/fundraiser";
import { Image } from "#/components/image";
import { RichText, richtext_styles, to_text } from "#/components/rich-text";
import { Target, to_target } from "#/components/target";
import { app_name, base_url } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { unpack } from "#/helpers/unpack";
import type { IFund } from "#/types/fund";
import { MAX_EXPIRATION_ISO } from "@/fundraiser/schema";
import type { Route } from "./+types/route";
import { Share } from "./share";
import { Video } from "./video";

export { headers, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

export const links: Route.LinksFunction = () => [...richtext_styles];

export const meta: Route.MetaFunction = ({ loaderData: d, location: l }) => {
  if (!d) return [];
  return metas({
    title: `${d.name} - ${app_name}`,
    description: to_text(d.description_pt ?? undefined).slice(0, 140),
    name: d.name,
    image: d.banner || flying_character,
    url: `${base_url}/${l.pathname}`,
  });
};
export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Fund);

function Fund({ loaderData }: Route.ComponentProps) {
  const { url, ...fund } = loaderData;

  const status = status_fn(
    fund.expiration ?? MAX_EXPIRATION_ISO,
    fund.active,
    fund.donation_total_usd
  );

  return (
    <section className="grid pb-10 bg-muted">
      <div className="group relative xl:container xl:mx-auto px-5 grid md:grid-cols-[3fr_2fr] gap-4">
        <div className="self-start mt-14 ease-in-out z-10 grid gap-4 relative">
          <div className="absolute -top-8 flex items-center justify-between w-full">
            <Link
              className="flex items-center gap-x-1 active:-translate-x-1"
              to="../fundraisers"
            >
              <ArrowLeft size={16} />
              <span>Fundraisers</span>
            </Link>
            <FundStatus
              status={status}
              classes={{
                container: "text-xs",
                active: "",
                inactive: "text-destructive",
                completed: "text-success",
                expired: "text-muted-fg",
              }}
            />
          </div>

          <div className="bg-card rounded p-4">
            <div className="grid max-md:gap-y-4 items-center max-md:justify-items-center md:grid-cols-[auto_1fr]">
              <div className="mr-4 md:row-span-2">
                <Image
                  src={fund.logo || flying_character}
                  width={60}
                  className="rounded-full object-cover bg-card"
                />
              </div>

              <h4 className="md:col-start-2 max-md:text-center  font-bold text-2xl w-full wrap-break-word">
                {fund.name}
              </h4>
              <div className="pl-0.5">
                <span className="text-sm font-medium text-muted-fg mr-1">
                  by
                </span>
                <FundCreator
                  name={fund.creator_name}
                  id={fund.creator_id}
                  classes="font-medium inline"
                />
              </div>
              <DonateSection
                {...fund}
                classes={{
                  container: "col-span-full md:hidden",
                  target: "mt-8",
                }}
              />
            </div>
          </div>

          <div className="rounded overflow-hidden bg-card">
            {fund.banner && (
              <img
                src={fund.banner}
                className="w-full object-cover object-center max-sm:h-40"
                alt={`${fund.name} banner`}
              />
            )}
            <RichText
              content={{
                value: fund.description_pt,
              }}
              classes={{
                field: "",
                container: "p-4",
              }}
              readOnly
            />
          </div>

          {fund.videos.map((v, idx) => (
            <div key={idx} className="rounded">
              <Video url={v} />
            </div>
          ))}

          <DonorMsgs id={fund.id} classes="mt-4" />
        </div>
        <div
          id="info-card"
          className="md:sticky md:top-30 bg-card self-start flex flex-col content-start z-10 rounded p-4"
        >
          {" "}
          <DonateSection
            {...fund}
            classes={{ container: "max-md:hidden", link: "mb-4 order-first" }}
          />
          <p className="text-muted-fg md:mt-8 mb-2 font-bold uppercase text-xs">
            Donations go to
          </p>
          <div className="grid gap-y-4 mb-4 grid-cols-[auto_1fr]">
            {fund.members.map((m) => (
              <div
                key={m.id}
                className="grid items-center gap-x-2 grid-cols-subgrid col-span-2"
              >
                <Image src={m.logo} className="aspect-2/1 rounded" width={50} />
                <Link
                  to={href("/marketplace/:id", { id: m.id.toString() })}
                  className="font-bold  text-muted-fg hover:text-primary"
                >
                  {m.name}
                </Link>
              </div>
            ))}
          </div>
          <Share recipientName={fund.name} url={url} className="mt-auto" />
        </div>
      </div>
    </section>
  );
}

interface Classes {
  container?: string;
  link?: string;
  target?: string;
}
interface IDonateSection extends IFund {
  classes?: Classes | string;
}
function DonateSection(props: IDonateSection) {
  const s = unpack(props.classes);
  return (
    <>
      {props.target && (
        <Target
          text={<Target.Text classes="mb-2" />}
          progress={props.donation_total_usd}
          target={to_target(props.target)}
          classes={`${s.target} ${s.container} w-full`}
        />
      )}
      <NavLink
        aria-disabled={
          !status_fn(
            props.expiration ?? MAX_EXPIRATION_ISO,
            props.active,
            props.donation_total_usd
          ).active
        }
        to={href("/donate-fund/:fund_id", { fund_id: props.id })}
        className={`w-full btn btn-primary px-6 py-3 text-sm ${s.link} ${s.container}`}
      >
        Donate now
      </NavLink>
    </>
  );
}
