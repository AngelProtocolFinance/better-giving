import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";

export const animal_rescue: PageContext = {
  meta_subject: {
    title: "Animal Nonprofits",
    description: "animal rescue nonprofits",
  },
  hero_subject: {
    1: "animal care",
    2: "rescue mission",
  },
  cta: {
    pre: "Rescue. Care.",
    body: "For animal nonprofits protecting lives with compassion",
  },
  hero: static_url("animal-rescue-hero.webp"),
  left: static_url("animal-rescue-left.webp"),
  right: static_url("animal-rescue-right.webp"),
  partners: "animal rescue nonprofits",
};
