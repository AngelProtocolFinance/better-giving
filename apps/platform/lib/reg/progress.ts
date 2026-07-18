import type { IReg } from "./schema";

export class Progress {
  r: IReg;

  constructor(reg: IReg) {
    this.r = reg;
  }

  get init() {
    const { id, r_id, claim } = this.r;
    return { id, r_id: r_id, claim };
  }

  /** step 1 */
  get contact() {
    const {
      r_first_name: fn,
      r_last_name: ln,
      o_name: on,
      r_org_role: or,
      rm,
    } = this.r;

    if (fn && ln && on && or && rm) {
      return {
        ...this.init,
        r_first_name: fn,
        r_last_name: ln,
        o_name: on,
        r_org_role: or,
        r_org_role_other: this.r.r_org_role_other,
        r_contact_number: this.r.r_contact_number,
        rm: rm,
        rm_referral_code: this.r.rm_referral_code,
        rm_other: this.r.rm_other,
      };
    }
    return undefined;
  }

  /** step 2 */
  get org() {
    const $ = this.contact;
    const { o_website: w, o_hq_country: c, o_designation: d } = this.r;
    if (w && c && d && $) {
      return {
        o_website: w,
        o_hq_country: c,
        o_activity_countries: this.r.o_active_in_countries,
        o_designation: d,
        ...$,
      };
    }
    return undefined;
  }

  /** step 3 */
  get org_type() {
    const $ = this.org;
    const { o_type: ot } = this.r;
    return $ && ot ? { o_type: ot, ...$ } : undefined;
  }

  /** step 4 fsa  */
  get docs_fsa() {
    const $ = this.org_type;
    if (!$) return undefined;
    const { o_type, ...rest3 } = $;
    if (o_type !== "other") return undefined;

    const {
      r_proof_of_identity: poi,
      o_proof_of_reg: por,
      o_registration_number: rn,
      o_project_description: pd,
      o_legal_entity_type: lt,
    } = this.r;

    if (poi && por && rn && pd && lt) {
      return {
        r_proof_of_identity: poi,
        o_proof_of_reg: por,
        o_registration_number: rn,
        o_project_description: pd,
        o_legal_entity_type: lt,
        o_type,
        ...rest3,
      };
    }

    return undefined;
  }

  /** step 4b fsa */
  get fsa_url() {
    const $ = this.docs_fsa;
    const { o_fsa_signing_url: u } = this.r;
    return u && $ ? { o_fsa_signing_url: u, ...$ } : undefined;
  }

  /** step 4c fsa */
  get fsa_signed() {
    const $ = this.fsa_url;
    const { o_fsa_signed_doc_url: x } = this.r;
    return $ && x ? { o_fsa_signed_doc_url: x, ...$ } : undefined;
  }

  /** step 4 ein */
  get docs_ein() {
    const $ = this.org_type;
    if (!$) return undefined;
    const { o_type, ...rest3 } = $;
    if (o_type !== "501c3") return undefined;

    const { o_ein: n } = this.r;
    return n ? { o_ein: n, o_type, ...rest3 } : undefined;
  }

  /** step 5 */
  get banking() {
    const $ein = this.docs_ein;
    const $fsa = this.fsa_signed;
    const $4 = $fsa || $ein;
    const { o_bank_id: bid, o_bank_statement: bos } = this.r;
    return $4 && bid && bos
      ? { o_bank_id: bid, o_bank_statement: bos, ...$4 }
      : undefined;
  }

  get step() {
    if (this.banking) return 6;
    if (this.docs_ein || this.fsa_signed) return 5;
    if (this.org_type) return 4;
    if (this.org) return 3;
    if (this.contact) return 2;
    return 1;
  }
  get steps(): boolean[] {
    return [
      this.contact,
      this.org,
      this.org_type,
      this.docs_ein || this.fsa_signed,
      this.banking,
    ].map((x) => !!x);
  }
}
