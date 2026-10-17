import * as v from "valibot";
import { img_output } from "#/components/img-editor";
import { $req, org_designation, reg_number, slug } from "@/npo/schema";

/** letters and digits from the legal name, for the empty slug's placeholder */
export function suggest_slug(name: string): string {
  const chars = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 30);
  return chars || "myNonprofit";
}

export const schema = v.object({
  logo: img_output({ required: true }),
  name: $req,
  registration_number: reg_number,
  endow_designation: org_designation,
  hq_country: $req,
  slug,
});

export type FV = v.InferInput<typeof schema>;

export const fields = [
  "logo",
  "name",
  "registration_number",
  "endow_designation",
  "hq_country",
  "slug",
] as const satisfies (keyof FV)[];
