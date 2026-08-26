import { flat_colors as c } from "@better-giving/brand/flat";

/* the radix ramps, keyed by radix step number. pdf-lib draws into a document
   with no stylesheet, so nothing here can read a css custom property — the hex
   has to be a value. it comes from `@better-giving/brand/flat`, the same twin
   the email templates read, so the ramp cannot drift out from under a file a
   donor downloads. only the steps a call site actually reaches are carried, so
   a step missing below is unused, not wrong. */

export const blue = {
  "3": c.blue_3,
  "6": c.blue_6,
  "8": c.blue_8,
  "9": c.blue_9,
  "11": c.blue_11,
  "12": c.blue_12,
};

export const green = {
  "2": c.green_2,
  "6": c.green_6,
  "8": c.green_8,
  "9": c.green_9,
  "11": c.green_11,
};

export const amber = {
  "3": c.amber_3,
  "6": c.amber_6,
  "8": c.amber_8,
  "9": c.amber_9,
  "11": c.amber_11,
  "12": c.amber_12,
};

export const gray = {
  "3": c.gray_3,
  "6": c.gray_6,
  "8": c.gray_8,
  "9": c.gray_9,
  "11": c.gray_11,
  "12": c.gray_12,
};

export const red = {
  "9": c.red_9,
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
