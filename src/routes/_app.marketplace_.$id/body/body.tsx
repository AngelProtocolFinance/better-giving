import { Globe, MapPin } from "lucide-react";
import { href, NavLink } from "react-router";
import { BookmarkBtn } from "#/components/bookmark-btn";
import { Breadcrumbs } from "#/components/breadcrumbs";
import { ExtLink } from "#/components/ext-link";
import { Target, to_target } from "#/components/target";
import { VerifiedIcon } from "#/components/verified-icon";
import type { INpo } from "$/pg/queries/npo";

interface Props {
  npo: INpo;
  classes?: string;
  children?: React.ReactNode;
  program?: string;
}

export function Body({ classes = "", npo, children, program }: Props) {
  return (
    <div
      className={`flex justify-center items-center w-full h-full ${classes}`}
    >
      <div className="xl:container xl:mx-auto px-5 grid gap-8 justify-items-center w-full h-full pt-32 pb-8 lg:grid-rows-[auto_auto_1fr] lg:grid-cols-[1fr_auto] lg:justify-items-start lg:gap-16 lg:pt-6 lg:pb-20">
        <Breadcrumbs
          className="text-xs sm:text-sm lg:ml-52"
          items={[
            {
              title: "Marketplace",
              to: href("/marketplace"),
              end: true,
            },
            {
              title: npo.name,
              to: href("/marketplace/:id", {
                id: npo.id.toString(),
              }),
            },
          ]}
        />
        <div className="order-3 lg:order-2 flex items-center gap-4 max-lg:flex-col w-full">
          {npo.target && (
            <Target
              text={<Target.Text classes="mb-2" />}
              progress={npo.contributions_total ?? 0}
              target={to_target(npo.target)}
            />
          )}

          <NavLink
            to={`${href("/donate/:id", {
              id: npo.id.toString(),
            })}${program ? `?programId=${program}` : ""}`}
            className="btn btn-primary w-full lg:w-48 h-12 px-6 lg:text-sm"
          >
            Donate now
          </NavLink>
        </div>

        <div className="order-2 lg:order-3 lg:col-span-2 flex flex-col gap-8 w-full items-center">
          <div className="flex flex-col items-center lg:items-start w-full gap-2 text-center lg:text-left">
            <div className="flex max-sm:flex-col items-center gap-3">
              <h3 className="font-header text-3xl w-full max-w-2xl break-words">
                {(npo.claimed ?? true) && (
                  <VerifiedIcon
                    classes="relative inline bottom-px mr-2"
                    size={27}
                  />
                )}
                <span>{npo.name}</span>
              </h3>
              <BookmarkBtn
                npo={{
                  id: npo.id,
                  name: npo.name,
                  logo: npo.logo ?? undefined,
                }}
              />
            </div>
            <p className="w-full text-lg">{npo.tagline}</p>
          </div>
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-center w-full font-semibold">
            {npo.hq_country && (
              <span className="flex items-center gap-2 uppercase">
                <MapPin className="text-primary" size={20} />
                {npo.hq_country}
              </span>
            )}

            {npo.url && (
              <span className="flex items-center gap-2">
                <Globe className="text-primary" size={20} />
                <ExtLink
                  href={npo.url}
                  title="organization website"
                  className="underline decoration-1 hover:text-primary hover:decoration-2"
                >
                  {npo.url.replace(/^https?:\/\//i, "")}
                </ExtLink>
              </span>
            )}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
