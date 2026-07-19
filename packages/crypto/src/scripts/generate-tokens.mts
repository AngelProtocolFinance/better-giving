import existing_chains from "../generated/chains.json" with { type: "json" };
import existing_symbols from "../generated/symbols.json" with { type: "json" };
import type { ITokensMap } from "../types";
import { custom_tokens } from "./custom.mts";
import {
  get_tokens,
  process_tokens,
  to_processed,
  write_json,
} from "./helpers.mts";

const tokens = await get_tokens("v1");

/// CHECK FOR NEW CHAINS ///
const new_chains: string[] = [];
const new_symbols: string[] = [];
for (const token of tokens) {
  if (!(existing_symbols as any)[token.code]) {
    console.log(token);
    new_symbols.push(token.code);
  }

  if (!(existing_chains as any)[token.network]) {
    console.log(token);
    new_chains.push(token.network);
  }
}

if (new_chains.length > 0) {
  console.log({ new_chains });
  throw "New chains found. addt them before proceeding";
}
if (new_symbols.length > 0) {
  console.log({ new_symbols });
  throw "New tokens found. add them before proceeding";
}

/// generate tokens list ///
const list_id = process_tokens(
  tokens,
  "./src/generated/tokens/list.json",
  custom_tokens
);

/// generate tokens map ///
const custom_tokens_map = custom_tokens.reduce((prev, curr) => {
  prev[curr.code] = curr;
  return prev;
}, {} as ITokensMap);
const tokens_map = tokens.reduce((prev, curr) => {
  prev[curr.code] = to_processed(curr);
  return prev;
}, custom_tokens_map);

const map_id = write_json(tokens_map, "./src/generated/tokens/map.json");

// also write hashes to monitor change
write_json([list_id, map_id], "./src/generated/tokens/hash.json");
