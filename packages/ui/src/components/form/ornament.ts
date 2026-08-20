/**
 * hit areas for an interactive ornament sitting inside a field's box — the
 * drawer chevron, the clear X, the show-password eye.
 *
 * the glyph is 16-20px, which is under WCAG 2.2 SC 2.5.8's 24px floor, and the
 * spacing exception can't rescue it: the ornament sits ON TOP of the input,
 * which is itself a target. so the hit area is the field's full-height edge
 * rather than a box grown around the glyph — `px-4` lands the glyph's inner
 * edge exactly where `right-4`/`left-4` did, `items-center` over `inset-y-0`
 * exactly where `top-1/2 -translate-y-1/2` did. same pixel, ~50x50 target.
 *
 * lives beside the field languages rather than in `components/select` because
 * the shape is a field's, not a select's — the password eye and the standalone
 * npo combobox are neither.
 */

/**
 * the outermost trailing lane. the clear X takes this one when a control
 * offers both, so the destructive action is the one under the thumb.
 */
export const ornament_end_cls =
  "absolute inset-y-0 right-0 px-4 flex items-center";

/**
 * the second trailing lane, inboard of `ornament_end_cls`.
 *
 * `right-12` is that lane's own width (16 + 16px glyph + 16), so the two abut
 * without overlapping instead of stacking on one edge. a control drawing both
 * has to reserve `pr-24` on its input.
 */
export const ornament_end_inboard_cls =
  "absolute inset-y-0 right-12 px-4 flex items-center";

/** the leading-edge mirror — the country flag. reserve `pl-12`. */
export const ornament_start_cls =
  "absolute inset-y-0 left-0 px-4 flex items-center";

/**
 * the exception: a control that GROWS can't use a full-height lane, because
 * full height is the whole tag block and the glyph would float mid-control.
 * so this is an explicit 28px box pinned to the first row instead — over the
 * 24px floor, and centering a 20px glyph in it reproduces `right-2 top-3` to
 * the pixel.
 */
export const ornament_row_cls =
  "absolute right-1 top-2 shrink-0 size-7 flex items-center justify-center";
