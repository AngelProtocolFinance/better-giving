import { href } from "react-router";

interface IOrgRef {
  id: number | string;
  slug?: string | null;
}

/** the public profile: `/org/<slug>`, `/org/<id>` until a slug is set */
export const org_href = ({ id, slug }: IOrgRef) =>
  href("/org/:org", { org: slug || String(id) });

/** a program page under its org's profile */
export const program_href = (org: IOrgRef, program_id: string) =>
  href("/org/:org/program/:program_id", {
    org: org.slug || String(org.id),
    program_id,
  });
