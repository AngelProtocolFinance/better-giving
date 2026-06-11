import type { IUserNpo } from "@/users";

export type INpoBookmark = {
  id: number;
  name: string;
  logo?: string;
};

export interface IUserNpo2 extends IUserNpo {
  name: string;
  logo?: string;
}
