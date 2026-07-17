import { anvil } from "$/kit/anvil";
import type { Signer } from "./types";

export const signer_fn = async (eid: string): Promise<Signer> => {
  const res = await anvil.requestGraphQL({
    query: `query signer($eid: String!) {
        signer(eid: $eid) {
          name
          email
          clientUserId
        }
      }`,
    variables: { eid },
  });
  const { name, email, clientUserId } = res.data?.data.signer || {};
  return { eid: clientUserId, name, email };
};
