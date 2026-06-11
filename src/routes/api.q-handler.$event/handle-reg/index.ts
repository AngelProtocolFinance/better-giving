import {
  registration_approved,
  registration_new,
  registration_rejected,
} from "@better-giving/react-emails";
import type { CompanyProperties, ContactProperties } from "@/hubspot";
import { Progress } from "@/reg/progress";
import type { IReg } from "@/reg/schema";
import { send_email } from "$/email";
import { hubspot } from "$/env";
import { bg_sales } from "$/kit/discord";
import { wise } from "$/kit/wise";
import { REFERRALS, ROLES } from "./constants";
import {
  create_deal,
  update_or_create_company,
  update_or_create_contact,
} from "./hubspot";

export async function handle_reg_created(r: { id: string; r_id: string }) {
  const { node, subject } = registration_new.template({
    reference_id: r.id,
  });
  const res = await send_email({
    to: [r.r_id],
    node,
    subject,
  });
  console.info(res.data?.id);
}

export async function handle_reg_updated(reg: IReg) {
  let ctp: ContactProperties | undefined;
  let cmp: CompanyProperties | undefined;

  const prog = new Progress(reg);
  const c = prog.contact;

  if (c) {
    ctp = {
      email: c.r_id,
      firstname: c.r_first_name,
      lastname: c.r_last_name,
      contract_phone_number: c.r_contact_number ?? "Not specified",
      contact_role_in_organisation: ROLES[c.r_org_role] || "Other",
      hubspot_owner_id: hubspot.owner_id,
      n501c_or_charitable_registration: "Yes",
      contact_role: "Charity contact",
    };
    cmp = {
      name: c.o_name,
      point_of_contact__initial_goal_: "deprecated:not specified",
      how_did_you_find_out_about_us_: REFERRALS[c.rm || "other"] || "Other",
      angel_giving_registration_number: reg.id,
      hubspot_owner_id: hubspot.owner_id,
    };
  }
  const o = prog.org;
  if (o && cmp) {
    cmp.website = o.o_website;
    cmp.country = o.o_hq_country;
  }

  const dfsa = prog.docs_fsa;
  if (dfsa && ctp) {
    ctp.identification_documentation = dfsa.r_proof_of_identity;
  }

  if (dfsa && cmp) {
    cmp.proof_of_charity_registration_documentation = dfsa.o_proof_of_reg;
    cmp.ein_or_charity_registration_number = dfsa.o_registration_number;
  }

  const dein = prog.docs_ein;
  if (dein && ctp) {
    ctp.identification_documentation = "not applicable";
  }

  if (dein && cmp) {
    cmp.ein_or_charity_registration_number = dein.o_ein;
    cmp.proof_of_charity_registration_documentation = "not applicable";
    cmp.fiscal_sponsorship_agreement_signed_document = "not applicable";
  }

  const fsa_signed = prog.fsa_signed;
  if (fsa_signed && cmp) {
    cmp.fiscal_sponsorship_agreement_signed_document =
      fsa_signed.o_fsa_signed_doc_url;
  }

  const bnk = prog.banking;
  if (bnk && cmp) {
    const { address, accountNumber, name, details } = await wise.v2_account(
      +bnk.o_bank_id
    );

    cmp.bank_account_number = `${accountNumber || "not specified"}`;
    cmp.bank_name = name.fullName || "not specified";
    cmp.bank_address = `${address?.city}, ${address?.country}`;
    cmp.bank_name =
      details.abartn ||
      details.BIC ||
      details.bankCode ||
      details.swiftCode ||
      "not specified";
    cmp.bank_statament = bnk.o_bank_statement;
  }

  if (reg.status === "02") {
    const res = await bg_sales.send_alert({
      from: `registration lambda:${reg.env}`,
      title: "New application submitted for review",
      fields: [
        { name: "Registration id", value: reg.id },
        { name: "NPO name", value: reg.o_name || "missing" },
      ],
    });
    console.info(res.status, res.statusText);
    const deal = await create_deal(reg.o_name || "missing");
    console.info(deal);
  }

  if (reg.status === "04") {
    const { node, subject } = registration_rejected.template({
      registrant_first_name: reg.r_first_name || "missing",
      rejection_reason: reg.status_rejected_reason || "not specified",
    });
    const res = await send_email({ node, subject, to: [reg.r_id] });
    console.info(res.data?.id);
  }

  if (reg.status === "03") {
    const { node, subject } = registration_approved.template({
      registrant_first_name: reg.r_first_name || "missing",
      org_name: reg.o_name || "missing",
      endow_id: reg.status_approved_npo_id?.toString() || "0",
    });

    const res = await send_email({ node, subject, to: [reg.r_id] });
    console.info(res.data?.id);
  }

  if (ctp) {
    const contact = await update_or_create_contact(reg.r_id, ctp);
    console.info(`hubspot contact:${contact.id}`);
  }

  if (cmp) {
    const company = await update_or_create_company(reg.id, cmp);
    console.info(`hubspot company:${company.id}`);
  }
}
