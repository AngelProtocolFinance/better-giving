import { Outlet } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import fallback_banner from "#/assets/images/bg-banner.webp";
import flying_character from "#/assets/images/flying-character.webp";
import { Image } from "#/components/image";
import { richtext_styles } from "#/components/rich-text";
import { app_name, base_url } from "#/constants/env";
import { metas } from "#/helpers/seo";
import type { Route } from "./+types/route";
import { Body } from "./body/body";

export { headers, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>({});

export const links: Route.LinksFunction = () => [...richtext_styles];
export const meta: Route.MetaFunction = ({ loaderData: d }) => {
  if (!d) return [];
  const npo_url = `${base_url}/marketplace/${d.npo.id}`;
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: base_url },
      {
        "@type": "ListItem",
        position: 2,
        name: "Marketplace",
        item: `${base_url}/marketplace`,
      },
      { "@type": "ListItem", position: 3, name: d.npo.name, item: npo_url },
    ],
  };
  return metas({
    title: `${d.npo.name} - ${app_name}`,
    description: d.npo.tagline?.slice(0, 140),
    name: d.npo.name,
    image: d.npo.image || flying_character,
    // canonical route is /marketplace/:id (every internal href uses it)
    url: npo_url,
    jsonld: breadcrumbs,
  });
};
export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Page);
function Page({ loaderData: d, params }: Route.ComponentProps) {
  return (
    <section className="grid grid-rows-[auto_auto_1fr] items-center isolate w-full h-full">
      <div
        className="relative w-full h-52 sm:h-72 bg-cover bg-center"
        style={{
          backgroundImage: `url('${d.npo.image || fallback_banner}')`,
        }}
      />
      <div className="xl:container xl:mx-auto px-5 flex justify-center items-center w-full overflow-visible h-0 isolate lg:justify-start">
        <Image
          src={d.npo.logo || flying_character}
          className="size-48 border rounded-full object-cover bg-card"
        />
      </div>

      <Body npo={d.npo} program={params.program_id}>
        <Outlet context={d} />
      </Body>
    </section>
  );
}
