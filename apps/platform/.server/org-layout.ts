import {
  type IOrgShape,
  ROW_MAX,
  STORY_SHORT_MAX,
  type TOrgLayout,
  threshold_layout,
} from "@/org-shape";
import { type IJevChoice, jev_choice } from "./jev";

const SHORT = `story up to about ${STORY_SHORT_MAX} characters (or none)`;
const LONG = `story longer than about ${STORY_SHORT_MAX} characters`;
const ONE_ROW = `0–${ROW_MAX} items in total`;
const MANY = `${ROW_MAX + 1} or more items in total`;

const LAYOUT_QUESTION: IJevChoice<TOrgLayout> = {
  instructions:
    "Which layout should this nonprofit's public profile page use, given how much room its content takes? Story length is plain-text characters. Items are its campaigns, fundraisers, programs and videos together. Banner, logo, tagline and name length shape the hero inside any layout, not the choice between them.",
  criteria: {
    poster: `${SHORT} and ${ONE_ROW}: hero-led, a single screen with who they are, why, Donate, and up to ${ROW_MAX} ways to help`,
    letter: `${LONG} and ${ONE_ROW}: editorial, a reading column with a large lead, the ways to help at the end, and a slim give bar that follows the reader`,
    hub: `${SHORT} and ${MANY}: a compact identity header, then a tab for each kind of item, with counts`,
    feature: `${LONG} and ${MANY}: the story beside a sticky give panel, then one swipeable row per kind of item`,
  },
};

/** Jev picks the layout from the measures; with no answer from Jev (no key,
 * timeout, error), the size rules do */
export async function pick_layout(
  shape: IOrgShape
): Promise<{ layout: TOrgLayout; by: "jev" | "threshold" }> {
  // spread: an interface has no index signature, so isn't a Record
  const layout = await jev_choice({ ...shape }, LAYOUT_QUESTION);
  if (layout) return { layout, by: "jev" };
  return { layout: threshold_layout(shape), by: "threshold" };
}
