import type { IAlertPref, IInviteNew } from "./schema";

export interface IInvite extends IInviteNew {
  expire_at: number;
}

export interface IUserBookmark {
  user: string;
  npo: number;
}

export interface INpoAdmin {
  // null when the row is a pending invite for a non-existing user
  id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  pending: boolean;
}

export interface IUserNpo {
  id: number;
  alert_pref?: IAlertPref;
}
