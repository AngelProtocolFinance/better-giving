import json from "../generated/tokens/list.json" with { type: "json" };
import type { IToken } from "../types";

export default json as IToken[];

//custom tokens have separator
export const is_custom = (id: string) => id.includes("_");
