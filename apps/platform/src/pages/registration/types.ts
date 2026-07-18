import type { AuthUser } from "#/types/auth";
import type { IReg } from "@/reg";

export type Reg$IdData = {
  reg: IReg;
  user: AuthUser;
};
