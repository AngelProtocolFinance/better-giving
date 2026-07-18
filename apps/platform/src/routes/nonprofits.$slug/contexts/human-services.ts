import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";

export const human_services: PageContext = {
  meta_subject: {
    title: "Human Services Nonprofits",
    description: "human services nonprofits",
  },
  hero_subject: {
    1: "care",
    2: "human services mission",
  },
  cta: {
    pre: "Support. Uplift.",
    body: "For human services nonprofits meeting vital needs",
  },
  hero: static_url("human-services-hero.webp"),
  left: static_url("human-services-left.webp"),
  right: static_url("human-services-right.webp"),
  partners: "human services nonprofits",
};
