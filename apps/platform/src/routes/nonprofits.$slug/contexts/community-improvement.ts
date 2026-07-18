import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";

export const community_improvement: PageContext = {
  meta_subject: {
    title: "Community Nonprofits",
    description: "community nonprofits",
  },
  hero_subject: {
    1: "communities",
    2: "community mission",
  },
  cta: {
    pre: "Unite. Build.",
    body: "For community nonprofits strengthening local impact",
  },
  hero: static_url("community-improvement-hero.webp"),
  left: static_url("community-improvement-left.webp"),
  right: static_url("community-improvement-right.webp"),
  partners: "community nonprofits",
};
