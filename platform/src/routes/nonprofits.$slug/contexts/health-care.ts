import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";

export const health_care: PageContext = {
  meta_subject: {
    title: "Health Nonprofits",
    description: "health nonprofits",
  },
  hero_subject: {
    1: "health",
    2: "health mission",
  },
  cta: {
    pre: "Heal. Support.",
    body: "For health nonprofits improving lives every day",
  },
  hero: static_url("health-care-hero.webp"),
  left: static_url("health-care-left.webp"),
  right: static_url("health-care-right.webp"),
  partners: "health nonprofits",
};
