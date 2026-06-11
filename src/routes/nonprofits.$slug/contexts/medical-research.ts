import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";

export const medical_research: PageContext = {
  meta_subject: {
    title: "Medical Research Nonprofits",
    description:
      "medical research nonprofits fund breakthroughs and grow reserves",
  },
  hero_subject: {
    1: "discovery",
    2: "research mission",
  },
  cta: {
    pre: "Discover. Innovate.",
    body: "For medical research nonprofits driving breakthroughs",
  },
  hero: static_url("medical-research-hero.webp"),
  left: static_url("medical-research-left.webp"),
  right: static_url("medical-research-right.webp"),
  partners: "medical research nonprofits",
};
