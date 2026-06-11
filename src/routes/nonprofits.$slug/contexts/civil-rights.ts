import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";

export const civil_rights: PageContext = {
  meta_subject: {
    title: "Advocacy Nonprofits",
    description: "advocacy nonprofits",
  },
  hero_subject: {
    1: "change",
    2: "advocacy mission",
  },
  cta: {
    pre: "Stand. Speak.",
    body: "For advocacy nonprofits driving social change",
  },
  hero: static_url("civil-rights-hero.webp"),
  left: static_url("civil-rights-left.webp"),
  right: static_url("civil-rights-right.webp"),
  partners: "advocacy nonprofits",
};
