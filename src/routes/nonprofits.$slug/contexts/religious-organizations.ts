import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";

export const religious_organizations: PageContext = {
  meta_subject: {
    title: "Faith-Based Nonprofits",
    description: "faith-based nonprofits",
  },
  hero_subject: {
    1: "faith",
    2: "faith-based mission",
  },
  cta: {
    pre: "Faith. Serve.",
    body: "For faith-based nonprofits spreading hope and compassion",
  },
  hero: static_url("religious-organizations-hero.webp"),
  left: static_url("religious-organizations-left.webp"),
  right: static_url("religious-organizations-right.webp"),
  partners: "faith-based nonprofits",
};
