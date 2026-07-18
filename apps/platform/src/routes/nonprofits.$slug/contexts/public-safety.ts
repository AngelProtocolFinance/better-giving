import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";

export const public_safety: PageContext = {
  meta_subject: {
    title: "Disaster Relief Nonprofits",
    description: "disaster relief nonprofits",
  },
  hero_subject: {
    1: "relief",
    2: "relief mission",
  },
  cta: {
    pre: "Prepare. Respond.",
    body: "For disaster relief nonprofits protecting lives and communities",
  },
  hero: static_url("public-safety-hero.webp"),
  left: static_url("public-safety-left.webp"),
  right: static_url("public-safety-right.webp"),
  partners: "disaster relief nonprofits",
};
