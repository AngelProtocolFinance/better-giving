// apca-w3 0.1.9 ships no types. only the three entry points contrast.test.ts
// calls are declared.
declare module "apca-w3" {
  // signed Lc from linear luminance; text first, ground second. polarity matters.
  export function APCAcontrast(txtY: number, bgY: number): number;
  // sRGB 8bpc, 0-255; fractional channels are accepted.
  export function sRGBtoY(rgb: readonly number[]): number;
  // src-over composite of [r,g,b,alpha] onto [r,g,b]; round=false keeps the
  // fractional channels, which is what the ledger's figures were measured on.
  export function alphaBlend(
    fg: readonly number[],
    bg: readonly number[],
    round?: boolean
  ): number[];
}
