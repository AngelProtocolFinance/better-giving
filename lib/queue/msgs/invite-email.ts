import type { IMsg } from "../types";

export interface Payload {
  invitee: string;
  invitee_first_name: string;
  invitor: string;
  npo_name: string;
}

export const to_msg = (p: Payload): IMsg => ({
  id: "invite-email",
  payload: p,
  dedupe: `invite_${p.invitee}`,
});

export const is_for = (msg: IMsg): msg is IMsg & { payload: Payload } =>
  msg.id === "invite-email";
