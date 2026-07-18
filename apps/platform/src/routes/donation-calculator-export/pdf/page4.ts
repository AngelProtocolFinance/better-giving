import type { PDFDocument, PDFPage } from "pdf-lib";
import { base_url } from "#/constants/env";
import { blue, fs, gray, w } from "../styles";
import { draw_footer } from "./footer";
import { add_link, draw_rect, draw_text, draw_wrapped, y_pdf } from "./layout";
import type { Fonts, Images } from "./types";
import { PAGE_W } from "./types";

export function draw_page4(
  doc: PDFDocument,
  page: PDFPage,
  fonts: Fonts,
  images: Images
) {
  const px = w["30"];
  const content_w = PAGE_W - px * 2;

  // --- header bar ---
  const header_h = 60;
  draw_rect(page, 0, 0, PAGE_W, header_h, blue.d);

  draw_text(page, "APPENDIX", px, 35, fonts.bold, fs.xl, "#ffffff");

  // logo
  const logo_w = 120;
  const logo_h = (images.logo.height / images.logo.width) * logo_w;
  const logo_x = PAGE_W - px - logo_w;
  const logo_y_top = (header_h - logo_h) / 2;
  page.drawImage(images.logo, {
    x: logo_x,
    y: y_pdf(logo_y_top + logo_h),
    width: logo_w,
    height: logo_h,
  });
  add_link(doc, page, logo_x, logo_y_top, logo_w, logo_h, base_url);

  // --- calculation details heading ---
  let y = header_h + w["14"];
  const title = "CALCULATION DETAILS";
  draw_text(page, title, px, y + fs.lg2, fonts.semibold, fs.lg2);
  const title_w = fonts.semibold.widthOfTextAtSize(title, fs.lg2);
  draw_rect(
    page,
    px + title_w + w["4"],
    y + fs.lg2 / 2,
    content_w - title_w - w["4"],
    1,
    gray.d
  );

  // --- better giving platform ---
  y += fs.lg2 + w["20"];
  draw_text(
    page,
    "Better Giving Platform",
    px,
    y + fs.lg,
    fonts.semibold,
    fs.lg
  );
  y += fs.lg + w["8"];

  const bullets_bg = [
    "Better Giving doesn't charge processing fees, but third-party services charge an average of 2% (no platform fees)",
    "80% of donors opt to cover processing fees (based on platform data)",
    "Better Giving accepts all donation types (credit cards, ACH, digital wallets, crypto, stocks, DAF)",
  ];
  const bullet_indent = w["8"];
  const bullet_text_x = px + bullet_indent + w["10"];
  for (const bullet of bullets_bg) {
    draw_text(
      page,
      "\u2022",
      px + bullet_indent,
      y + fs.md,
      fonts.regular,
      fs.md,
      gray.d1
    );
    const h = draw_wrapped(
      page,
      bullet,
      bullet_text_x,
      y,
      fonts.regular,
      fs.md,
      content_w - bullet_indent - w["10"],
      { color: gray.d1 }
    );
    y += Math.max(h, fs.md * 1.4) + w["4"];
  }

  // --- donation type calculation ---
  y += w["14"];
  draw_text(
    page,
    "Donation Type Calculation",
    px,
    y + fs.lg,
    fonts.semibold,
    fs.lg
  );
  y += fs.lg + w["8"];

  const h = draw_wrapped(
    page,
    "These are approximate percentages for U.S.-based nonprofits, annualized and projected for 2025 based on trends. Our calculations assume 50% of donors will not proceed to make a donation if their preferred donation method is unavailable.",
    px,
    y,
    fonts.regular,
    fs.md,
    content_w,
    { color: gray.d1 }
  );
  y += h + w["6"];

  const don_types = [
    "Credit card donations: 63% of total volume",
    "ACH/Bank Transfer donations: 10% of total volume",
    "Digital Wallet donations: 7% of total volume",
    "Cryptocurrency donations: 2% of total volume",
    "Stock donations: 6% of total volume",
    "DAF donations: 12% of total volume",
  ];
  for (const item of don_types) {
    draw_text(
      page,
      "\u2022",
      px + bullet_indent,
      y + fs.md,
      fonts.regular,
      fs.md,
      gray.d1
    );
    draw_text(
      page,
      item,
      bullet_text_x,
      y + fs.md,
      fonts.regular,
      fs.md,
      gray.d1
    );
    y += fs.md * 1.4 + w["6"];
  }

  // --- investment returns ---
  y += w["14"];
  draw_text(page, "Investment Returns", px, y + fs.lg, fonts.semibold, fs.lg);
  y += fs.lg + w["8"];

  const inv_items = [
    "Savings Account: 4% annual yield",
    "Sustainability Fund: 20% average annual return",
    "Returns compound daily",
  ];
  for (const item of inv_items) {
    draw_text(
      page,
      "\u2022",
      px + bullet_indent,
      y + fs.md,
      fonts.regular,
      fs.md,
      gray.d1
    );
    draw_text(
      page,
      item,
      bullet_text_x,
      y + fs.md,
      fonts.regular,
      fs.md,
      gray.d1
    );
    y += fs.md * 1.4 + w["6"];
  }

  // --- laira mascot (bottom right, above footer) ---
  const mascot_w = 150;
  const mascot_h =
    (images.laira_laptop.height / images.laira_laptop.width) * mascot_w;
  page.drawImage(images.laira_laptop, {
    x: PAGE_W - w["20"] - mascot_w,
    y: 50 + 10, // above footer
    width: mascot_w,
    height: mascot_h,
  });

  draw_footer(doc, page, fonts, images);
}
