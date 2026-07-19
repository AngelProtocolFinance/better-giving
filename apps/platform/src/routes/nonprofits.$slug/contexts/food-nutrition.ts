import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";

export const food_nutrition: PageContext = {
  meta_subject: {
    title: "Food and Nutrition Nonprofits",
    description: "food and nutrition nonprofits",
  },
  hero_subject: {
    1: "nourishment",
    2: "food mission",
  },
  cta: {
    pre: "Feed. Nourish.",
    body: "For food and nutrition nonprofits ending hunger",
  },
  hero: static_url("food-nutrition-hero.webp"),
  left: static_url("food-nutrition-left.webp"),
  right: static_url("food-nutrition-right.webp"),
  partners: "food and nutrition nonprofits",
};
