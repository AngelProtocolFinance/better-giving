import { EMAILS } from "@better-giving/brand";
import nodemailer from "nodemailer";
import type { ReactElement } from "react";
import { render } from "react-email";
import { report_error } from "@/errors/report";
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
export const sender = `Better Giving ${emoji} <${EMAILS.hi}>`;

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
    // reported here rather than at each call site: a swallowed refusal is
    // invisible everywhere else, and vercel's logs are not read until a donor
    // asks where their mail went. subject only — `to`/`bcc` are donor and admin
    // addresses, and a report is not a place for them.
    report_error(err, { subject: i.subject });
    return { data: null, error: err };
  }
}

/**
 * the send whose failure must not pass for success.
 *
 * a queued send has a retry or a send-once lease behind it, and both are driven
 * by the throw: a handler that returns normally tells qstash the mail is away
 * and stamps the row to match, so a refusal swallowed here is a mail lost for
 * good with the row asserting it went out.
 *
 * fire-and-forget callers keep `send_email` — a magic link, a webhook handler,
 * a dashboard action must not fail the flow that triggered them over a bounced
 * notification.
 */
export async function send_email_or_throw(i: IInput) {
  const { data, error } = await send_email(i);
  if (!data) throw error;
  return data;
}
