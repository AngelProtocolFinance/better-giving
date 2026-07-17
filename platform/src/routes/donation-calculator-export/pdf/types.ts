import type { PDFFont, PDFImage, PDFPage } from "pdf-lib";

export interface Fonts {
  light: PDFFont;
  regular: PDFFont;
  medium: PDFFont;
  semibold: PDFFont;
  bold: PDFFont;
}

export interface Images {
  logo: PDFImage;
  footer_jpg: PDFImage;
  laira_laptop: PDFImage;
  laira_pointing: PDFImage;
  laira_yellow: PDFImage;
  icon_facebook: PDFImage;
  icon_instagram: PDFImage;
  icon_intercom: PDFImage;
  icon_linkedin: PDFImage;
  icon_x: PDFImage;
  icon_youtube: PDFImage;
}

export interface DrawContext {
  page: PDFPage;
  fonts: Fonts;
  images: Images;
}

// A4 in points
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
