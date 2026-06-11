export interface BaseProperties {
  hubspot_owner_id: string;
}

export namespace ContactProperties {
  export interface Init extends Record<string, string> {
    email: string;
    firstname: string;
    lastname: string;
    contract_phone_number: string;
    contact_role_in_organisation: string;
    hubspot_owner_id: string;
    n501c_or_charitable_registration: "Yes";
    contact_role: "Charity contact" | "Donor contact"; // |..others
  }
  export interface Documentation extends Record<string, string> {
    identification_documentation: string;
  }
}

export interface ContactProperties
  extends BaseProperties,
    ContactProperties.Init,
    Partial<ContactProperties.Documentation> {}

export interface DealProperties extends BaseProperties, Record<string, string> {
  dealname: string;
  pipeline: "default";
  dealstage: string;
}

export namespace CompanyProperties {
  export interface Org extends Record<string, string> {
    website: string;
    country: string;
    un_sdg: string;
  }
  export interface Documentation extends Record<string, string> {
    proof_of_charity_registration_documentation: string;
    fiscal_sponsorship_agreement_signed_document: string;
    ein_or_charity_registration_number: string;
  }
  export interface Bank extends Record<string, string> {
    bank_account_number: string;
    bank_address: string;
    bank_name: string;
    bank_statament: string;
  }

  export interface Init extends Record<string, string> {
    name: string;
    /** registration id */
    angel_giving_registration_number: string;
    point_of_contact__initial_goal_: string;
    how_did_you_find_out_about_us_: string;
  }
}
export interface CompanyProperties
  extends Record<string, string>,
    BaseProperties,
    CompanyProperties.Init,
    Partial<CompanyProperties.Org>,
    Partial<CompanyProperties.Documentation>,
    Partial<CompanyProperties.Bank> {}
