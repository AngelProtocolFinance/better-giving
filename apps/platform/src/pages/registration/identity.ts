import type { IRegNew, IRegStartFv } from "@/reg";

/** what an action returns instead of writing, when the identity belongs to a
 * listing that already has members behind it. */
export interface IDuplicate {
  duplicate: { name: string };
}

/** the flat form values as the variant a row is written from. `o_type`, the
 * identity column it implies and the hq country never travel apart — see
 * `reg_new`. */
export const identity_payload = (fv: IRegStartFv, r_id: string): IRegNew =>
  fv.o_type === "501c3"
    ? {
        r_id,
        o_type: "501c3",
        o_ein: fv.o_ein,
        // step 2 no longer asks for it, and `Progress.org` needs it
        o_hq_country: "United States",
      }
    : {
        r_id,
        o_type: "other",
        o_hq_country: fv.o_hq_country,
        o_registration_number: fv.o_registration_number,
      };

/** the pair `npo_owned_by_regnum` matches an existing listing on. Creating an
 * application and changing its identity resolve it the same way, so the two
 * paths can never disagree about what counts as a duplicate. */
export const identity_regnum = (p: IRegNew): [rn: string, country: string] =>
  p.o_type === "501c3"
    ? [p.o_ein, "United States"]
    : [p.o_registration_number, p.o_hq_country];
