import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";
export const education: PageContext = {
  meta_subject: {
    title: "Education Nonprofits",
    description: "education nonprofits",
  },
  hero_subject: {
    1: "learning",
    2: "education mission",
  },
  cta: {
    pre: "Teach. Inspire.",
    body: "For education nonprofits shaping brighter futures",
  },
  hero: static_url("education-hero.webp"),
  left: static_url("education-left.webp"),
  right: static_url("education-right.webp"),
  partners: "education nonprofits",
};
