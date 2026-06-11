import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";

export const disease_awareness: PageContext = {
  meta_subject: {
    title: "Health Associations",
    description: "health associations",
  },
  hero_subject: {
    1: "health research",
    2: "association",
  },
  cta: {
    pre: "Unite. Advance.",
    body: "For health associations leading progress in care and research",
  },
  hero: static_url("disease-awareness-hero.webp"),
  left: static_url("disease-awareness-left.webp"),
  right: static_url("disease-awareness-right.webp"),
  partners: "health associations",
};
