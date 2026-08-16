// oklch() -> sRGB hex, CSS Color 4 reference conversion (D65, sRGB gamma).
// clamps out-of-gamut channels per-channel rather than erroring, same as
// tailwind v4's oklch fallback. browsers instead chroma-reduce (hold L and h,
// walk C toward the gamut boundary), which can land a few hex steps apart on
// an out-of-gamut token — not used by any token the email mirror consumes.
const f = (x: number) => {
  const a = Math.abs(x);
  return a <= 0.0031308
    ? 12.92 * x
    : Math.sign(x) * (1.055 * a ** (1 / 2.4) - 0.055);
};

export function oklch_to_hex(L: number, C: number, h_deg: number): string {
  const h = (h_deg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${lin
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(f(v) * 255)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}
