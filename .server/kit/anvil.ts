import Anvil from "@anvilco/anvil";
import { anvil as anvil_env } from "../env";

export const anvil = new Anvil({
  apiKey: anvil_env.api_key,
});
