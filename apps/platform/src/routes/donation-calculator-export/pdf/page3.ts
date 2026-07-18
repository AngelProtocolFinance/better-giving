import type { PDFDocument, PDFPage } from "pdf-lib";
import { BOOK_A_DEMO } from "#/constants/urls";
import { blue, fs, gray, w } from "../styles";
import { draw_footer } from "./footer";
import { add_link, draw_rect, draw_text, draw_wrapped, y_pdf } from "./layout";
import type { Fonts, Images } from "./types";
import { PAGE_W } from "./types";

const benefits = [
  {
    title: "80% Donor Fee Coverage",
    description:
      "Better Giving enables all donors to cover processing fees, and our data shows 80% opt to do so.",
  },
  {
    title: "All Donation Types",
    description:
      "Accept all donation types including crypto, stocks, and DAF, increasing your donation volume.",
  },
  {
    title: "Lower Processing Fees",
    description:
      "Better Giving doesn't charge any processing fees, but the third-party services we utilize charge an average rate of 2% (reduced to less than 0.5% with donor coverage)",
  },
  {
    title: "Automated Investments",
    description:
      "Automatically allocate a portion of donations to high-yield savings and investment accounts.",
  },
];

export function draw_page3(
  doc: PDFDocument,
  page: PDFPage,
  fonts: Fonts,
  images: Images
) {
  const px = w["24"];
  const content_w = PAGE_W - px * 2;

  // --- benefits section ---
  let y = w["20"];
  draw_text(
    page,
    "Better Giving Benefits",
    px,
    y + fs.xl,
    fonts.bold,
    fs.xl,
    blue.d
  );
  y += fs.xl + w["20"];

  for (const benefit of benefits) {
    draw_text(page, benefit.title, px, y + fs.lg, fonts.semibold, fs.lg);
    y += fs.lg + w["6"];
    const h = draw_wrapped(
      page,
      benefit.description,
      px,
      y,
      fonts.regular,
      fs.md,
      content_w * 0.9,
      { color: gray.d2 }
    );
    y += h + w["20"];
  }

  // --- CTA section ---
  // laira yellow (left)
  const ly_w = 40;
  const ly_h = (images.laira_yellow.height / images.laira_yellow.width) * ly_w;
  page.drawImage(images.laira_yellow, {
    x: PAGE_W / 2 - 120,
    y: y_pdf(y + ly_h),
    width: ly_w,
    height: ly_h,
  });

  // "Book A Demo!" button
  const btn_text = "BOOK A DEMO!";
  const btn_font_size = fs.lg;
  const btn_text_w = fonts.bold.widthOfTextAtSize(btn_text, btn_font_size);
  const btn_px = w["20"];
  const btn_py = w["10"];
  const btn_w = btn_text_w + btn_px * 2;
  const btn_h = btn_font_size + btn_py * 2;
  const btn_x = PAGE_W / 2 - btn_w / 2 + w["10"];
  const btn_y_top = y + (ly_h - btn_h) / 2;

  // rounded rect bg
  draw_rect(page, btn_x, btn_y_top, btn_w, btn_h, blue.d);
  draw_text(
    page,
    btn_text,
    btn_x + btn_px,
    btn_y_top + btn_py + btn_font_size * 0.8,
    fonts.bold,
    btn_font_size,
    "#ffffff"
  );
  add_link(doc, page, btn_x, btn_y_top, btn_w, btn_h, BOOK_A_DEMO);

  // --- footer image (full width at bottom) ---
  const fimg_w = PAGE_W;
  const fimg_h = (images.footer_jpg.height / images.footer_jpg.width) * fimg_w;
  const footer_bar_h = 50;
  page.drawImage(images.footer_jpg, {
    x: 0,
    y: footer_bar_h,
    width: fimg_w,
    height: fimg_h,
  });

  // laira pointing (right) — drawn after footer image so it's on top
  const lp_w = 70;
  const lp_h =
    (images.laira_pointing.height / images.laira_pointing.width) * lp_w;
  page.drawImage(images.laira_pointing, {
    x: PAGE_W / 2 + btn_w / 2 + w["10"],
    y: y_pdf(y + lp_h + w["10"]),
    width: lp_w,
    height: lp_h,
  });

  draw_footer(doc, page, fonts, images);
}
