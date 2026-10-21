import type { MetaDescriptor } from "react-router";
import { metas } from "#/helpers/seo";

/** flatRoutes id of this layout; its loader is where `endow.name` lives. */
const LAYOUT_ID = "routes/admin.$id";

interface IMatch {
  id: string;
  loaderData?: unknown;
  data?: unknown;
}

function org_from(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || !("endow" in data)) return;
  const endow = data.endow;
  if (!endow || typeof endow !== "object" || !("name" in endow)) return;
  return typeof endow.name === "string" && endow.name ? endow.name : undefined;
}

function org_name(
  matches: readonly (IMatch | undefined)[]
): string | undefined {
  const layout = matches.find((match) => match?.id === LAYOUT_ID);
  return org_from(layout?.loaderData ?? layout?.data);
}

export function admin_title(
  page: string,
  org: string | undefined
): MetaDescriptor[] {
  return metas({ title: org ? `${page} - ${org}` : page });
}

export function admin_page_meta(
  page: string,
  matches: readonly (IMatch | undefined)[]
): MetaDescriptor[] {
  return admin_title(page, org_name(matches));
}
