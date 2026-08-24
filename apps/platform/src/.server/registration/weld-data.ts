import { anvil as anvil_env, stage } from "$/env";
import { anvil } from "$/kit/anvil";

interface WeldData {
  /** null until the signer finishes — a minted submission exists long before it. */
  documentGroup: {
    eid: string;
  } | null;
}
export async function weld_data_fn(eid: string): Promise<WeldData> {
  const response = await anvil.requestGraphQL({
    query: `query WeldDataQuery($eid: String!) {
        data: weldData(eid: $eid) {
          documentGroup {
            eid
          }
          
        }
      }`,
    variables: { eid },
  });

  if (!response.data) throw response.errors;
  return response.data.data.data;
}

interface Weld {
  eid: string;
}
/** a weld resolves by slug only together with the organization it belongs to. */
export async function weld_fn(slug: string): Promise<Weld> {
  const response = await anvil.requestGraphQL({
    query: `query WeldQuery($slug: String!, $organizationSlug: String!) {
        data: weld(slug: $slug, organizationSlug: $organizationSlug) {
          eid
        }
      }`,
    variables: { slug, organizationSlug: anvil_env.org_slug },
  });

  if (!response.data) throw response.errors;
  return response.data.data.data;
}

interface NewWeldData {
  eid: string;
  /** where the signer fills the form in — one submission, minted for one person. */
  continueURL: string;
}
/**
 * mints a submission server-side so the eid exists before the signer does
 * anything. the alternative — the public weld url — produces an anonymous
 * submission whose eid is the only thing tying the document to a person, which
 * is a claim anyone holding the eid can make.
 */
export async function weld_data_create(weld_eid: string): Promise<NewWeldData> {
  const response = await anvil.requestGraphQL({
    query: `mutation CreateWeldData($weldEid: String!, $isTest: Boolean) {
        data: createWeldData(weldEid: $weldEid, isTest: $isTest) {
          eid
          continueURL
        }
      }`,
    // only production files a real submission — every other stage, local
    // included, mints against anvil's test environment
    variables: { weldEid: weld_eid, isTest: stage !== "production" },
  });

  if (!response.data) throw response.errors;
  return response.data.data.data;
}
