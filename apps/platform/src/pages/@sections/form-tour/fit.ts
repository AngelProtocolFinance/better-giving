/** the marketing header's height, pinned at the top (`top-16` on the stage) */
export const HEADER = 64;
/** under this the form's text stops reading as the real form */
export const MIN_SCALE = 0.75;
/** breathing room kept between the stage and the viewport's edges */
const GAP = 8;

export interface IFit {
  scale: number;
  /** from the pinned box's top to the scaled stage's top, px */
  offset: number;
}

/** how far to scale the pinned stage so all of it — the tile and Laira's
 *  overhang, `natural` px unscaled — shows below the header. it has to fit
 *  twice: pinned (box top at the header's foot), and at load, when the box
 *  still sits at the column's own top `col_top`, below a banner if one shows.
 *  null when even `MIN_SCALE` does not fit: that viewport gets the stills. */
export function stage_fit(
  natural: number,
  viewport: number,
  col_top: number
): IFit | null {
  const top = Math.max(col_top, HEADER);
  const scale = Math.min(1, (viewport - top - 2 * GAP) / natural);
  if (scale < MIN_SCALE) return null;
  const h = natural * scale;
  // centred under the header, unless that would push the at-load view past
  // the viewport's foot
  const offset = Math.min(
    (viewport - HEADER - h) / 2,
    viewport - top - GAP - h
  );
  return { scale, offset };
}
