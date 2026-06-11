import type { ReactElement } from "react";
import { Resend } from "resend";
import { resend as resend_env, stage } from "./env";

const resend = new Resend(resend_env.api_key);

const emoji = stage === "production" ? "😇" : "🧪";
export const sender = `Better Giving ${emoji} <hi@better.giving>`;

interface IInput {
  node: ReactElement;
  to: string[];
  bcc?: string[];
  subject: string;
}

export async function send_email(i: IInput) {
  return resend.emails.send({
    from: sender,
    to: i.to,
    bcc: i.bcc,
    subject: i.subject,
    react: i.node,
  });
}

export { resend };
