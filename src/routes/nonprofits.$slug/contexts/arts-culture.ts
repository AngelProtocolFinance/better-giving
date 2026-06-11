import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";

export const arts_culture: PageContext = {
  meta_subject: {
    title: "Arts and Culture Nonprofits",
    description: "arts and culture nonprofits",
  },
  hero_subject: {
    1: "creativity",
    2: "arts mission",
  },
  cta: {
    pre: "Create. Share.",
    body: "For arts and culture nonprofits building lasting impact",
  },
  hero: static_url("arts-culture-hero.webp"),
  left: static_url("arts-culture-left.webp"),
  right: static_url("arts-culture-right.webp"),
  partners: "arts and culture nonprofits",
};
