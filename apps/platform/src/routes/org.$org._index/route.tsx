import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import flying_character from "#/assets/images/flying-character.webp";
import { richtext_styles } from "#/components/rich-text";
import { app_name, base_url } from "#/constants/env";
import { metas } from "#/helpers/seo";
import type { Route } from "./+types/route";
import { Profile } from "./profile";

export { headers, loader } from "./api";
export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>({});

export const links: Route.LinksFunction = () => [...richtext_styles];
export const meta: Route.MetaFunction = ({ loaderData: d }) => {
  if (!d) return [];
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
      { "@type": "ListItem", position: 3, name: d.npo.name, item: d.url },
    ],
  };
  return metas({
    title: `${d.npo.name} - ${app_name}`,
    description: d.npo.tagline?.slice(0, 140),
    name: d.npo.name,
    image: d.npo.image || flying_character,
    // canonical route is /org/:org (slug, else id); /marketplace/:id 301s here
    url: d.url,
    jsonld: breadcrumbs,
  });
};
export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Page);
function Page({ loaderData }: Route.ComponentProps) {
  return <Profile {...loaderData} />;
}
