const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomChars(n: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const referral_id = (prefix?: "NPO") => {
  const id = randomChars(8);
  return `${prefix ? `${prefix}-` : ""}${id.slice(0, 4)}-${id.slice(4)}`;
};
