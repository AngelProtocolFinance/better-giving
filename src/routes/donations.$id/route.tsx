import { Collapsible } from "@ark-ui/react/collapsible";
import { CheckCircle2Icon, ChevronDownIcon, StarIcon } from "lucide-react";
import { useRef } from "react";
import { href, Link, NavLink } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import char from "#/assets/images/celebrating-character.webp";
import laira_gift from "#/assets/laira/laira-gift.webp";
import { Image } from "#/components/image";
import { confetti } from "#/helpers/confetti";
import { metas } from "#/helpers/seo";
import type { Route } from "./+types/route";
import { PrivateMsgForm } from "./private-msg-form";
import { PublicMsgForm } from "./public-msg-form";
import { ShareBtn, socials } from "./share";
import { TributeForm } from "./tribute-form";

export { action, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();

export const meta: Route.MetaFunction = ({ loaderData: d }) => {
  if (!d) return [];
  return metas({
    title: `Donation to ${d.to_name}`,
    image: laira_gift,
    description: `I just donated to ${d.to_name} on Better Giving! ${d && d.to_type === "fund" ? "My gift to this fundraiser helps raise funds for causes they love. Why don't you donate as well?" : "They can choose to use my gift today, or save and invest it for sustainable growth"}. When you give today, you give forever.`,
    url: d.donate_url,
  });
};

export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Page);

function Page({ loaderData: data }: Route.ComponentProps) {
  const widget_version = data.source === "bg-widget";
  const confetti_fired = useRef(false);

  return (
    <div className="grid content-start justify-items-center max-w-140 mx-auto px-4 py-8 scroll-mt-6">
      <div
        className="mb-6 justify-self-center"
        ref={(node) => {
          if (!node || confetti_fired.current) return;
          confetti_fired.current = true;
          confetti(node);
        }}
      >
        <Image src={char} width={80} />
      </div>
      <h3 className="text-xl sm:text-2xl mb-2 text-center leading-relaxed text-balance">
        Your generosity knows no bounds! Thank you for making a difference!
      </h3>
      <p className="mb-4 font-bold text-sm mt-8 text-primary text-center">
        Make your donation even more impactful
      </p>
      {!widget_version && (
        <Collapsible.Root className="w-full border bg-card rounded overflow-hidden">
          <Collapsible.Trigger className="group flex w-full items-start gap-x-2 p-4 text-left">
            <span className="h-lh flex items-center shrink-0">
              <CheckCircle2Icon
                className={
                  data.from_public_msg_to_npo
                    ? "stroke-success"
                    : "stroke-muted-fg fill-muted"
                }
                size={16}
              />
            </span>
            <span className="text-sm font-semibold">
              Share a message in{" "}
              <NavLink to={data.profile_url} className="text-primary">
                {data.to_name}
              </NavLink>
              {data.to_type === "fund"
                ? " fundraiser page"
                : `${data.to_name.toLowerCase().endsWith("s") ? "'" : "'s"} profile.`}
            </span>
            <span className="ml-auto h-lh flex items-center shrink-0">
              <ChevronDownIcon className="size-5 group-data-[state=open]:rotate-180 transition-transform ease-in-out" />
            </span>
          </Collapsible.Trigger>
          <Collapsible.Content className="p-4 border-t">
            <PublicMsgForm init={data.from_public_msg_to_npo} />
          </Collapsible.Content>
        </Collapsible.Root>
      )}
      {data.to_type !== "fund" ? (
        <Collapsible.Root className="w-full border bg-card rounded overflow-hidden mt-2">
          <Collapsible.Trigger className="group flex w-full items-start gap-x-2 p-4 text-left">
            <span className="h-lh flex items-center shrink-0">
              <CheckCircle2Icon
                className={
                  data.from_private_msg_to_npo
                    ? "stroke-success"
                    : "stroke-muted-fg fill-muted"
                }
                size={16}
              />
            </span>
            {widget_version ? (
              <span className="text-sm font-semibold">Leave us a message</span>
            ) : (
              <span className="text-sm font-semibold">
                Send a private message to{" "}
                <NavLink to={data.profile_url} className="text-primary">
                  {data.to_name}
                </NavLink>
              </span>
            )}

            <span className="ml-auto h-lh flex items-center shrink-0">
              <ChevronDownIcon className="size-5 group-data-[state=open]:rotate-180 transition-transform ease-in-out" />
            </span>
          </Collapsible.Trigger>
          <Collapsible.Content className="p-4 border-t">
            <PrivateMsgForm init={data.from_private_msg_to_npo} />
          </Collapsible.Content>
        </Collapsible.Root>
      ) : null}
      {data.to_type !== "fund" && (
        <Collapsible.Root className="w-full border bg-card rounded overflow-hidden mt-2">
          <Collapsible.Trigger className="group flex w-full items-start gap-x-2 p-4 text-left">
            <span className="h-lh flex items-center shrink-0">
              <CheckCircle2Icon
                className={
                  data.tribute ? "stroke-success" : "stroke-muted-fg fill-muted"
                }
                size={16}
              />
            </span>
            <span className="text-sm font-semibold">
              Dedicate your donation
            </span>
            <span className="ml-auto h-lh flex items-center shrink-0">
              <ChevronDownIcon className="size-5 group-data-[state=open]:rotate-180 transition-transform ease-in-out" />
            </span>
          </Collapsible.Trigger>
          <Collapsible.Content className="p-4 border-t">
            <TributeForm init={data.tribute} />
          </Collapsible.Content>
        </Collapsible.Root>
      )}
      {!widget_version && (
        <Collapsible.Root className="mt-2 w-full border bg-card rounded overflow-hidden">
          <Collapsible.Trigger className="group flex w-full items-start gap-x-2 p-4 text-left">
            <span className="h-lh flex items-center shrink-0">
              <StarIcon className="stroke-warning fill-warning" size={14} />
            </span>
            <span className="text-sm font-semibold">Spread the word!</span>
            <span className="ml-auto h-lh flex items-center shrink-0">
              <ChevronDownIcon className="size-5 group-data-[state=open]:rotate-180 transition-transform ease-in-out" />
            </span>
          </Collapsible.Trigger>
          <Collapsible.Content className="p-4 border-t">
            <p className="text-muted-fg">
              Encourage your friends to join in and contribute, making a
              collective impact through donations.
            </p>
            <div className="flex items-center gap-2 mt-1">
              {socials.map((s) => (
                <ShareBtn
                  key={s.id}
                  {...s}
                  recipient={{
                    id: data.to_id,
                    name: data.to_name,
                  }}
                  donate_thanks_url={data.donate_thanks_url}
                  donate_url={data.donate_url}
                />
              ))}
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      )}{" "}
      {widget_version && (
        <NavLink
          to={
            data.form_id
              ? href("/forms/:id", { id: data.form_id })
              : href("/donate-widget/:id", { id: data.to_id })
          }
          className="mt-4 btn btn-secondary w-full [.pending]:text-muted-fg"
        >
          Go Back
        </NavLink>
      )}
      {!widget_version && (
        <NavLink
          to={href("/dashboard/donations")}
          className="mt-4 btn btn-primary w-full [.pending]:text-muted-fg"
        >
          My donations
        </NavLink>
      )}
      {!widget_version && (
        <Link
          to={href("/marketplace")}
          className="btn btn-secondary w-full mt-2"
        >
          Browse nonprofits
        </Link>
      )}
    </div>
  );
}
