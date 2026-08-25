/* the radix ramps, copied step-for-step from packages/brand/src/colors.css.
   pdf-lib draws into a document with no stylesheet, so nothing here can read a
   css custom property — the hex has to be inlined. keys are the radix step
   numbers; only the steps a call site actually reaches are carried, so a step
   missing below is unused, not wrong. change a value in colors.css and it has
   to be re-copied here. */

export const blue = {
  "3": "#e4f4ff",
  "6": "#b0d6fb",
  "8": "#6daee9",
  "9": "#1e6dab",
  "11": "#206fad",
  "12": "#1c3d5b",
};

export const green = {
  "2": "#f4fbf7",
  "6": "#b0ddc6",
  "8": "#66b893",
  "9": "#0e8c62",
  "11": "#008057",
};

export const amber = {
  "3": "#ffefcd",
  "6": "#ffc977",
  "8": "#f19a00",
  "9": "#f59e0b",
  "11": "#ac6500",
  "12": "#4f3515",
};

export const gray = {
  "3": "#ecf1f7",
  "6": "#d2dbe7",
  "8": "#b4bdc8",
  "9": "#868f9a",
  "11": "#5d656f",
  "12": "#1a2029",
};

export const red = {
  "9": "#cc1926",
};

export const fs = {
  xxs: 7,
  xxs2: 8,
  sm: 9,
  base: 10,
  sm2: 11,
  md: 13,
  lg: 14,
  lg2: 16,
  xlm: 18,
  xl: 20,
} as const;

export const w = {
  "2": 2,
  "4": 4,
  "6": 6,
  "8": 8,
  "10": 10,
  "14": 14,
  "20": 20,
  "22": 22,
  "23": 23,
  "24": 24,
  "30": 30,
} as const;

export const fw = {
  l: 300, // light
  m: 500, // medium
  n: 400, // normal
  sb: 600, // semibold
  b: 700, // bold
} as const;
