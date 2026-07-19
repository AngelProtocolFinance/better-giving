import json from "../generated/tokens/map.json" with { type: "json" };
import type { ITokensMap } from "../types";
export default json as unknown as ITokensMap; //symbol is uppercase
