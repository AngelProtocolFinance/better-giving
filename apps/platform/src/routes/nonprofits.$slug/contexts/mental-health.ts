import { static_url } from "#/constants/urls";
import type { PageContext } from "../types";

export const mental_health: PageContext = {
  meta_subject: {
    title: "Mental Health Nonprofits",
    description: "mental health nonprofits",
  },
  hero_subject: {
    1: "healing",
    2: "mental health mission",
  },
  cta: {
    pre: "Listen. Heal.",
    body: "For mental health nonprofits restoring hope and resilience",
  },
  hero: static_url(
    "F%20-%20Mental%20Health%20%26%20Crisis%20Intervention.webp"
  ),
  left: static_url("Left.webp"),
  right: static_url("Right.webp"),
  partners: "mental health nonprofits",
};
