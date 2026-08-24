import type { ReactNode } from "react";

type Align = "end" | "split";

/** full literal class names, never composed — tailwind v4 is a jit over source
 *  text, so `actions-${align}` compiles to no rule and no error. */
const align_class: Record<Align, string> = {
  end: "actions",
  split: "actions-split",
};

interface Props {
  /** `split` is not a third alignment, it is a different row: the two controls
   *  are pushed apart so a misclick beside the confirm lands on nothing. it is
   *  for a reset or a destructive sitting opposite the confirm, never for a
   *  cancel — a cancel belongs next to what it cancels.
   *  @default "end" */
  align?: Align;
  /** the dialog footer band — the tinted, bordered strip the controls sit on.
   *  it holds its height when the footer renders no control at all, so a
   *  conditional row does not collapse the bottom of the dialog. */
  band?: boolean;
  /** margin only. the row owns its gap, and under `band` its padding too — two
   *  utilities of equal specificity resolve by stylesheet order, not by
   *  class-string order, so a second `p-*` or `gap-*` is a coin flip. */
  classes?: string;
  /** cancel first. the row does not enforce it, it records it: DOM order is
   *  also the stacked order at narrow and the tab order everywhere, so the
   *  control that undoes has to be the one a keyboard reaches first. */
  children: ReactNode;
}

/** the class layer stays reachable: where a `<Form>` or `<fetcher.Form>`
 *  element IS the row, `className="actions"` on the form beats nesting a div
 *  inside it that exists only to carry the class. same split `Button` makes —
 *  the component is the default, the recipe is still a name. */
export function Actions({
  align = "end",
  band,
  classes = "",
  children,
}: Props) {
  return (
    <div
      className={[align_class[align], band ? "actions-band" : "", classes]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
