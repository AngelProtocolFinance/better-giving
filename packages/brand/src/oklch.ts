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

const f_inv = (x: number) => {
  const a = Math.abs(x);
  return a <= 0.04045 ? x / 12.92 : Math.sign(x) * ((a + 0.055) / 1.055) ** 2.4;
};

// sRGB hex -> oklch, the inverse of oklch_to_hex. the triple is full precision:
// a caller writing it into css rounds it, and the round-trip back through
// oklch_to_hex is what says whether the rounding was safe.
// r == g == b lands a hair off neutral rather than on it — the three lms row
// sums differ in the tenth decimal — leaving a chroma around 1e-8 whose hue is
// float noise. below a millionth of a chroma unit, thousands of times finer
// than an 8-bit step, that reads as achromatic and gets no hue.
export function hex_to_oklch(hex: string): [number, number, number] {
  const digits = hex.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(digits)) {
    throw new Error(`not a 6-digit sRGB hex: ${hex}`);
  }
  const [r, g, b] = [0, 2, 4].map((i) =>
    f_inv(Number.parseInt(digits.slice(i, i + 2), 16) / 255)
  );
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const oa = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const ob = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(oa, ob);
  if (C < 1e-6) return [L, 0, 0];
  return [L, C, ((Math.atan2(ob, oa) * 180) / Math.PI + 360) % 360];
}
