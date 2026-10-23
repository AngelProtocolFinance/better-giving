import { is_brand_ground, use_ground } from "../brand-band";
import type { IOrgLayout } from "./types";

interface ICredential {
  credential: IOrgLayout["credential"];
  classes?: string;
}

/** the org's registration as plain text, "EIN 12-3456789", readily seen in
 * the first-load view. the label is muted on a light ground; on a brand fill
 * both halves take the band's ink. nothing when it is unknown */
export function Credential({ credential, classes = "" }: ICredential) {
  const muted = is_brand_ground(use_ground()) ? "" : "text-gray-11";
  if (!credential) return null;
  return (
    <p className={`text-sm md:text-base ${classes}`}>
      <span className={muted}>{credential.label}</span>{" "}
      <span className="figures font-semibold">{credential.value}</span>
    </p>
  );
}
