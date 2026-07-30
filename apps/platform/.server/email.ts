import nodemailer from "nodemailer";
import type { ReactElement } from "react";
import { render } from "react-email";
import { smtp, stage } from "./env";

// zeptomail; swapping providers means editing these three + the SMTP_PASSWORD
// secret. only the password is secret, so it's the only part kept in env.
const host = "smtp.zeptomail.com";
const port = 587; // starttls; 465 would need `secure: true`
const user = "emailapikey"; // zeptomail's fixed username — the token is the password

// no pooling: every invocation is a fresh serverless process, so a pool never
// gets reused and only risks holding the connection open past the response
const transport = nodemailer.createTransport({
  host,
  port,
  secure: false,
  auth: { user, pass: smtp.password },
});

const emoji = stage === "production" ? "😇" : "🧪";
export const sender = `Better Giving ${emoji} <hi@better.giving>`;

interface IInput {
  node: ReactElement;
  to: string[];
  bcc?: string[];
  subject: string;
}

export async function send_email(i: IInput) {
  const [html, text] = await Promise.all([
    render(i.node),
    render(i.node, { plainText: true }),
  ]);

  // nodemailer rejects on failure, but callers treat sending as best-effort and
  // don't catch — keep failures non-fatal so a bounced receipt can't fail the
  // donation/auth flow that triggered it
  try {
    const info = await transport.sendMail({
      from: sender,
      to: i.to,
      bcc: i.bcc,
      subject: i.subject,
      html,
      text,
    });
    // own shape rather than the provider's, so callers logging `data.id` survive
    // the next provider swap. `id` is the Message-ID header.
    return {
      data: { id: info.messageId, response: info.response },
      error: null,
    };
  } catch (err) {
    console.error(`email send failed — ${i.subject}:`, err);
    return { data: null, error: err };
  }
}
