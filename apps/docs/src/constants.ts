export const APP_NAME = "Better Giving";

// vite exposes client env vars under import.meta.env.VITE_* (was
// NEXT_PUBLIC_BG_FORM_ID under next). override via a VITE_BG_FORM_ID in .env.
export const BG_FORM_ID =
  import.meta.env.VITE_BG_FORM_ID || "E7JXrhQifQrS9XGw2CFNm";
