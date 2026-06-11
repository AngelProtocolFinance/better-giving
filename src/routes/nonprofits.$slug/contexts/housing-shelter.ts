import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";

export const housing_shelter: PageContext = {
  meta_subject: {
    title: "Housing Nonprofits",
    description: "housing nonprofits",
  },
  hero_subject: {
    1: "shelter",
    2: "housing mission",
  },
  cta: {
    pre: "Build. Shelter.",
    body: "For housing nonprofits providing homes and hope",
  },
  hero: static_url("housing-shelter-hero.webp"),
  left: static_url("housing-shelter-left.webp"),
  right: static_url("housing-shelter-right.webp"),
  partners: "health associations",
};
