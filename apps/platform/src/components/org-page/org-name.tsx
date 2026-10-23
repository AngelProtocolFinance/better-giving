import { NAME_DISPLAY_MAX } from "@/org-shape";

/** lg: Poster and Letter. md: Feature. sm: Hub, whose name shares its row
 * with the mark and the raised figures */
export type TOrgNameScale = "lg" | "md" | "sm";

/** [display, one rung down the type ladder] at each width */
const SIZE: Record<TOrgNameScale, [string, string]> = {
  lg: ["text-4xl md:text-6xl", "text-3xl md:text-5xl"],
  md: ["text-3xl md:text-5xl", "text-2xl md:text-4_5xl"],
  sm: ["text-3xl md:text-4xl", "text-2xl md:text-3xl"],
};

interface IOrgName {
  name: string;
  scale: TOrgNameScale;
  classes?: string;
}

/** the page's h1. a name that fits display size gets it on one line; a longer
 * one steps down a size and stops at two lines. ink is the ground's */
export function OrgName({ name, scale, classes = "" }: IOrgName) {
  // measured as the shape module measures it, so the layout and the size agree
  const long = name.trim().length > NAME_DISPLAY_MAX;
  const [display, stepped] = SIZE[scale];
  return (
    <h1
      className={`font-bold break-words ${long ? `${stepped} line-clamp-2` : display} ${classes}`}
    >
      {name}
    </h1>
  );
}
