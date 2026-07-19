import crypto from "node:crypto";
import fs from "node:fs";
import Keyv from "keyv";
import chains from "../generated/chains.json" with { type: "json" };
import symbols from "../generated/symbols.json" with { type: "json" };
import type { IRawToken, IToken, TEnsure } from "../types";
import { base_url } from "./env.mts";

// in-memory cache: dedups fetches within a run. cross-run persistence isn't
// wanted here — a fresh list each run is how new chains/symbols get detected.
const keyv = new Keyv();
export type Filtered = TEnsure<IRawToken, "network">;

export const get_tokens = async (
  ver: "staging" | "v1"
): Promise<Filtered[]> => {
  const base = `${base_url}/${ver}`;

  let tokens: IRawToken[] = (await keyv.get("tokens")) || [];
  if (tokens.length === 0) {
    tokens = await fetch(`${base}/crypto/v1/full-currencies`)
      .then((res) => res.json())
      .then((data: any) => data.currencies);
    await keyv.set("tokens", tokens);
  }

  const filtered: Filtered[] = [];
  for (const t of tokens) {
    if (!t.enable || !t.network || !t.available_for_to_conversion) {
      console.log(
        `${ver} token:${t.code} failed filtere enabled:${t.enable} network:${t.network} conversion?:${t.available_for_to_conversion} `
      );
      continue;
    }
    try {
      const res = await fetch(
        `${base}/crypto/v1/min-amount?currency_from=${t.code}&fiat_equivalent=usd`
      );
      if (!res.ok) throw await res.text();
      const token_key = `${ver}:${t.code}`;
      let token: Filtered | undefined = await keyv.get(token_key);
      console.log(token);
      if (!token) {
        token = await res.json().then<any>((x) => x);
        await keyv.set(token_key, token);
      }
      if (!token) continue;
      if ("code" in token) throw token;
      filtered.push(t as Filtered);
    } catch (err) {
      console.error(ver, err);
    }
  }
  console.log("total tokens filtered", filtered.length);
  return filtered.toSorted((a, b) => a.priority - b.priority);
};

export function write_json(json: object, file_path: string) {
  const str = JSON.stringify(json);
  const hash = crypto.createHash("sha256").update(str).digest("hex");
  fs.writeFileSync(file_path, str);
  console.log({ file_path });
  const file_name = file_path.split("/").at(-1)?.split(".")[0];
  return `${file_name}:${hash}`;
}

export const to_processed = (t: Filtered): IToken => {
  return {
    id: t.id.toString(),
    code: t.code,
    name: t.name,
    symbol: (symbols as any)[t.code],
    precision: t.precision,
    logo: t.logo_url,
    network: t.network,
    color: (chains as any)[t.network].color,
    cg_id: t.cg_id,
  };
};

export function process_tokens(
  tokens: Filtered[],
  file_path: string,
  custom?: IToken[]
) {
  const processed = tokens.map<IToken>(to_processed).concat(custom ?? []);
  return write_json(processed, file_path);
}
