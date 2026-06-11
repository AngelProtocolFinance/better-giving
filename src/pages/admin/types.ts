import type { AuthUser } from "#/types/auth";
import type { INpo } from "$/pg/queries/npo";

export interface LoaderData {
  id: number;
  user: AuthUser;
  endow: Pick<INpo, "logo" | "name" | "allocation" | "payout_minimum">;
}
