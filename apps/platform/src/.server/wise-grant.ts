import { app } from "$/env";

/** Proof that the signed-in user is the one who created this Wise recipient.
 *
 * Every recipient we create lives under a single Wise profile, so a recipient
 * id says nothing about who it belongs to — `v2_account` hands the full
 * `longAccountSummary` of any id to anyone who asks for it, and the referrals
 * page renders whatever `pay_id` names. We keep no record of who created what,
 * so instead of a lookup the proxy that mints a recipient hands the browser
 * this hmac, and the one surface that stores an id off a form refuses an id
 * that arrives without one.
 *
 * Scoped to the user, so a grant lifted off one account proves nothing on
 * another. Not expiring: it is a statement about the past, and the id it names
 * does not become someone else's later. */
const enc = new TextEncoder();

const b64url = (bytes: ArrayBuffer): string => {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const key = async () => {
  const secret = app.session_secret;
  if (!secret) throw new Error("APP_SESSION_SECRET is not set");
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
};

export const sign_recipient = async (
  user_id: string,
  recipient_id: number
): Promise<string> =>
  b64url(
    await crypto.subtle.sign(
      "HMAC",
      await key(),
      enc.encode(`${user_id}:${recipient_id}`)
    )
  );

export const verify_recipient = async (
  user_id: string,
  recipient_id: number,
  grant: string
): Promise<boolean> => {
  const want = await sign_recipient(user_id, recipient_id);
  if (want.length !== grant.length) return false;
  // compare the whole string either way — an early return here would leak the
  // matching prefix length
  let diff = 0;
  for (let i = 0; i < want.length; i++)
    diff |= want.charCodeAt(i) ^ grant.charCodeAt(i);
  return diff === 0;
};
