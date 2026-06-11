import { format } from "date-fns";
import type { PDFDocument, PDFPage } from "pdf-lib";
import { base_url } from "#/constants/env";
import { to_usd } from "#/helpers/to-usd";
import type { View } from "#/routes/_app.donation-calculator/types";
import { methods, methodsArr } from "#/types/donation-calculator";
import { blue, fs, gray, green, w } from "../styles";
import {
  add_link,
  draw_dot,
  draw_kv,
  draw_rect,
  draw_text,
  draw_text_center,
  draw_text_right,
  y_pdf,
} from "./layout";
import type { Fonts, Images } from "./types";
import { PAGE_W } from "./types";

export function draw_page1(
  doc: PDFDocument,
  page: PDFPage,
  v: View,
  fonts: Fonts,
  images: Images
) {
  const px = w["20"];
  const content_w = PAGE_W - px * 2;

  // === HEADER ===
  const header_h = 110;
  draw_rect(page, 0, 0, PAGE_W, header_h, blue.d);

  let y = 16;
  draw_text(
    page,
    "YOUR NONPROFIT'S FINANCIAL",
    px,
    y + fs.xl,
    fonts.bold,
    fs.xl,
    "#ffffff"
  );
  y += fs.xl + 6;
  draw_text(
    page,
    "ADVANTAGE WITH BETTER GIVING",
    px,
    y + fs.xl,
    fonts.bold,
    fs.xl,
    "#ffffff"
  );
  y += fs.xl + 8;
  draw_text(
    page,
    "Donation Processing & Investment Impact Calculator",
    px,
    y + fs.lg,
    fonts.regular,
    fs.lg,
    "#ffffff"
  );
  y += fs.lg + 4;
  draw_text(
    page,
    `Generated on ${format(new Date(), "PP")}`,
    px,
    y + fs.base,
    fonts.regular,
    fs.base,
    "#ffffff"
  );

  // logo in header — vertically centered
  const logo_w = 100;
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

  // === SECTION 1: current online donations ===
  y = header_h + w["24"];
  draw_text(
    page,
    "YOUR CURRENT ONLINE DONATIONS",
    px,
    y + fs.lg,
    fonts.semibold,
    fs.lg,
    blue.d
  );
  const s1_title_w = fonts.semibold.widthOfTextAtSize(
    "YOUR CURRENT ONLINE DONATIONS",
    fs.lg
  );
  draw_rect(
    page,
    px + s1_title_w + w["4"],
    y + fs.lg / 2,
    content_w - s1_title_w - w["4"],
    2,
    blue.d
  );

  // KV pairs - two columns
  y += fs.lg + w["10"];
  const col_w = (content_w - w["20"]) / 2;
  const kv_x1 = w["24"];
  const kv_x2 = w["24"] + col_w + w["20"];

  draw_kv(
    page,
    kv_x1,
    y + fs.base,
    col_w,
    "Annual Online Donations",
    to_usd(v.amount),
    fonts.regular,
    fonts.semibold,
    fs.base
  );
  draw_kv(
    page,
    kv_x2,
    y + fs.base,
    col_w,
    "Platform Fees",
    `${(v.ogPlatformFeeRate * 100).toFixed(2)}%`,
    fonts.regular,
    fonts.semibold,
    fs.base
  );
  y += fs.base + w["6"];

  draw_kv(
    page,
    kv_x1,
    y + fs.base,
    col_w,
    "Avg. Processing Fees",
    `${(v.ogProcessingFeeRate * 100).toFixed(2)}%`,
    fonts.regular,
    fonts.semibold,
    fs.base
  );
  draw_kv(
    page,
    kv_x2,
    y + fs.base,
    col_w,
    "Annual Platform Subscription",
    to_usd(v.ogSubsCost),
    fonts.regular,
    fonts.semibold,
    fs.base
  );
  y += fs.base + w["6"];

  // accepted donation types
  y += w["4"];
  draw_text(
    page,
    "Accepted Donation Types",
    w["24"],
    y + fs.base,
    fonts.regular,
    fs.base
  );
  draw_donation_methods(page, w["24"] + 130, y, v.ogDonMethods, fonts);

  // current amount received box
  y += fs.base + w["6"];
  const box_h = 40;
  draw_rect(page, w["23"], y, content_w - 6, box_h, gray.l4);

  const box_center_y = y + box_h / 2;
  draw_text_right(
    page,
    "Current Amount Received",
    PAGE_W - w["23"] - w["10"],
    box_center_y - 4,
    fonts.regular,
    fs.base
  );

  const og_net_str = to_usd(v.ogNet);
  const og_ded_str = `(${to_usd(-v.ogDeductions)})`;
  const net_color =
    v.ogNet > v.amount ? green.d : v.ogNet < v.amount ? "#ef4444" : undefined;
  draw_text_right(
    page,
    og_net_str,
    PAGE_W - w["23"] - 80,
    box_center_y + 12,
    fonts.bold,
    fs.base,
    net_color
  );
  draw_text_right(
    page,
    og_ded_str,
    PAGE_W - w["23"] - w["10"],
    box_center_y + 12,
    fonts.bold,
    fs.base,
    "#ef4444"
  );

  // === SECTION 2: annual impact with BG ===
  y += box_h + w["24"];
  const s2_title = "ANNUAL DONATION PROCESSING IMPACT WITH BETTER GIVING";
  draw_text(page, s2_title, px, y + fs.lg, fonts.semibold, fs.lg, blue.d);
  const s2_title_w = fonts.semibold.widthOfTextAtSize(s2_title, fs.lg);
  if (s2_title_w < content_w - 10) {
    draw_rect(
      page,
      px + s2_title_w + w["4"],
      y + fs.lg / 2,
      content_w - s2_title_w - w["4"],
      2,
      blue.d
    );
  }

  y += fs.lg + w["6"];
  // fee savings + added donations
  const usd_sign = (n: number) => (n > 0 ? `+${to_usd(n)}` : to_usd(n));
  draw_kv(
    page,
    kv_x1,
    y + fs.base,
    col_w,
    "Fee Savings",
    usd_sign(v.feeSavings),
    fonts.regular,
    fonts.semibold,
    fs.base
  );
  draw_kv(
    page,
    kv_x2,
    y + fs.base,
    col_w,
    "Platform Subscription Savings",
    usd_sign(v.ogSubsCost),
    fonts.regular,
    fonts.semibold,
    fs.base
  );
  y += fs.base + w["6"];

  draw_kv(
    page,
    kv_x1,
    y + fs.base,
    col_w,
    "Added Donations from New Payment Types",
    usd_sign(v.ogMissedFromDonTypes),
    fonts.regular,
    fonts.semibold,
    fs.base
  );
  y += fs.base + w["6"];

  // accepted donation types (all)
  draw_text(
    page,
    "Accepted Donation Types",
    w["24"],
    y + fs.base,
    fonts.regular,
    fs.base
  );
  draw_donation_methods(page, w["24"] + 130, y, methodsArr, fonts);

  // "with better giving" box
  y += fs.base + w["6"];
  draw_rect(page, w["22"], y, content_w - 4, box_h, gray.l4);
  draw_text_right(
    page,
    "With Better Giving",
    PAGE_W - w["22"] - w["10"],
    y + box_h / 2 - 4,
    fonts.semibold,
    fs.base
  );
  const bg_net_str = to_usd(v.bgNet);
  const bg_adv_str = `(+${to_usd(v.advantage)})`;
  const bg_color =
    v.bgNet > v.ogNet ? green.d : v.bgNet < v.ogNet ? "#ef4444" : undefined;
  draw_text_right(
    page,
    bg_net_str,
    PAGE_W - w["22"] - 80,
    y + box_h / 2 + 12,
    fonts.bold,
    fs.base,
    bg_color
  );
  draw_text_right(
    page,
    bg_adv_str,
    PAGE_W - w["22"] - w["10"],
    y + box_h / 2 + 12,
    fonts.bold,
    fs.base,
    green.d
  );

  // total annual advantage
  y += box_h;
  const adv_h = 36;
  draw_rect(page, w["22"], y, content_w - 4, adv_h, green.l5);
  draw_text_center(
    page,
    "Total annual advantage",
    PAGE_W / 2,
    y + 12,
    fonts.regular,
    fs.base
  );
  draw_text_center(
    page,
    `+${to_usd(v.advantage)}`,
    PAGE_W / 2,
    y + 26,
    fonts.bold,
    fs.base
  );

  // === SECTION 3: long-term financial growth ===
  y += adv_h + w["30"];
  const s3_title = "LONG-TERM FINANCIAL GROWTH (ESTIMATED PREDICTIONS)";
  draw_text(page, s3_title, px, y + fs.lg, fonts.semibold, fs.lg, blue.d);
  const s3_title_w = fonts.semibold.widthOfTextAtSize(s3_title, fs.lg);
  if (s3_title_w < content_w - 10) {
    draw_rect(
      page,
      px + s3_title_w + w["4"],
      y + fs.lg / 2,
      content_w - s3_title_w - w["4"],
      2,
      blue.d
    );
  }

  y += fs.lg + w["10"];
  draw_text(
    page,
    "How Strategic Saving and Allocation Through Better Giving Could Grow Your Nonprofit's Resources",
    px,
    y + fs.base,
    fonts.semibold,
    fs.base
  );

  y += fs.base + w["8"];
  // savings allocation description
  const alloc_x = w["30"];

  draw_text(
    page,
    "Savings & Investment Allocation:",
    alloc_x,
    y + fs.base,
    fonts.regular,
    fs.base
  );
  const alloc_label_w = fonts.regular.widthOfTextAtSize(
    "Savings & Investment Allocation:",
    fs.base
  );
  draw_text(
    page,
    " 10%",
    alloc_x + alloc_label_w,
    y + fs.base,
    fonts.semibold,
    fs.base
  );
  const ten_w = fonts.semibold.widthOfTextAtSize(" 10%", fs.base);
  draw_text(
    page,
    " of Annual Donations Allocated to Savings/Investments",
    alloc_x + alloc_label_w + ten_w,
    y + fs.base,
    fonts.regular,
    fs.base
  );

  y += fs.base + w["8"];
  draw_text(
    page,
    "Allocation Between Accounts:",
    alloc_x,
    y + fs.base,
    fonts.regular,
    fs.base
  );
  y += fs.base + w["4"];
  draw_text(
    page,
    `\u2022 ${(v.savingsRate * 100).toFixed(2)}%`,
    alloc_x + w["2"],
    y + fs.base,
    fonts.semibold,
    fs.base
  );
  const sr_w = fonts.semibold.widthOfTextAtSize(
    `\u2022 ${(v.savingsRate * 100).toFixed(2)}%`,
    fs.base
  );
  draw_text(
    page,
    " to High-Yield Savings Account (4% Annual Yield)",
    alloc_x + w["2"] + sr_w,
    y + fs.base,
    fonts.regular,
    fs.base
  );
  y += fs.base + w["4"];
  draw_text(
    page,
    `\u2022 ${(v.investedRate * 100).toFixed(2)}%`,
    alloc_x + w["2"],
    y + fs.base,
    fonts.semibold,
    fs.base
  );
  const ir_w = fonts.semibold.widthOfTextAtSize(
    `\u2022 ${(v.investedRate * 100).toFixed(2)}%`,
    fs.base
  );
  draw_text(
    page,
    " to Sustainability Fund (20% Average Annual Return)",
    alloc_x + w["2"] + ir_w,
    y + fs.base,
    fonts.regular,
    fs.base
  );

  // === impact cards (1yr, 5yr, 10yr) ===
  y += fs.base + w["24"];
  const card_w = (content_w - w["4"] * 2) / 3;
  for (let i = 0; i < 3; i++) {
    const idx = [0, 4, 9][i];
    const yr = [1, 5, 10][i];
    const p = v.projection[idx];
    const cx = px + i * (card_w + w["4"]);
    draw_impact_card(page, cx, y, card_w, yr, p, fonts);
  }
}

function draw_donation_methods(
  page: PDFPage,
  x: number,
  y: number,
  active: string[],
  fonts: Fonts
) {
  let mx = x;
  const dot_r = 3;
  // text baseline in top-down coords
  const text_baseline = y + fs.sm;
  // dot center aligns with text midline (baseline - 0.35 * size)
  const dot_cy = text_baseline - fs.sm * 0.35;
  for (const [id, name] of Object.entries(methods)) {
    const is_active = active.includes(id);
    draw_dot(
      page,
      mx + dot_r,
      dot_cy,
      dot_r,
      is_active ? blue.d : "#ffffff",
      is_active ? undefined : gray.l1
    );
    draw_text(
      page,
      name,
      mx + dot_r * 2 + w["4"],
      text_baseline,
      fonts.regular,
      fs.sm
    );
    mx +=
      fonts.regular.widthOfTextAtSize(name, fs.sm) +
      dot_r * 2 +
      w["4"] +
      w["8"];
  }
}

import type { Growth } from "#/routes/_app.donation-calculator/types";

function draw_impact_card(
  page: PDFPage,
  x: number,
  y_start: number,
  width: number,
  yr: number,
  p: Growth,
  fonts: Fonts
) {
  let y = y_start;
  const pad = w["4"];

  // impact header
  const hdr_h = 44;
  draw_rect(page, x, y, width, hdr_h, green.l5);
  const yr_label = `${yr} ${yr > 1 ? "Years" : "Year"} Impact`;
  draw_text_right(
    page,
    yr_label,
    x + width - pad,
    y + 16,
    fonts.semibold,
    fs.sm2
  );
  draw_text_right(
    page,
    to_usd(p.total),
    x + width - pad,
    y + 32,
    fonts.bold,
    fs.base,
    green.d
  );
  y += hdr_h + w["8"];

  // savings account (4%)
  draw_text_right(
    page,
    "Savings Account (4%)",
    x + width - pad,
    y + fs.base,
    fonts.semibold,
    fs.base
  );
  y += fs.base + w["4"];

  const kv_pairs = [
    ["Invested:", to_usd(p.liq)],
    ["Growth:", to_usd(p.end.liq - p.liq)],
    ["Balance:", to_usd(p.end.liq)],
  ];
  for (const [label, val] of kv_pairs) {
    const is_growth = label === "Growth:";
    draw_text_right(
      page,
      label,
      x + width - pad - 60,
      y + fs.base,
      fonts.regular,
      fs.base
    );
    draw_text_right(
      page,
      val,
      x + width - pad,
      y + fs.base,
      is_growth ? fonts.semibold : fonts.regular,
      fs.base,
      is_growth ? green.d : undefined
    );
    y += fs.base + w["4"];
  }

  // investment account (20%)
  y += w["6"];
  draw_text_right(
    page,
    "Investment Account (20%)",
    x + width - pad,
    y + fs.base,
    fonts.semibold,
    fs.base
  );
  y += fs.base + w["4"];

  const kv_lock = [
    ["Invested:", to_usd(p.lock)],
    ["Growth:", to_usd(p.end.lock - p.lock)],
    ["Balance:", to_usd(p.end.lock)],
  ];
  for (const [label, val] of kv_lock) {
    const is_growth = label === "Growth:";
    draw_text_right(
      page,
      label,
      x + width - pad - 60,
      y + fs.base,
      fonts.regular,
      fs.base
    );
    draw_text_right(
      page,
      val,
      x + width - pad,
      y + fs.base,
      is_growth ? fonts.semibold : fonts.regular,
      fs.base,
      is_growth ? green.d : undefined
    );
    y += fs.base + w["4"];
  }

  // total growth
  draw_text_right(
    page,
    "Total Growth:",
    x + width - pad - 60,
    y + fs.base,
    fonts.regular,
    fs.base
  );
  draw_text_right(
    page,
    to_usd(p.total),
    x + width - pad,
    y + fs.base,
    fonts.bold,
    fs.base,
    green.d
  );
  y += fs.base + w["10"];

  // balance footer
  const ftr_h = 44;
  draw_rect(page, x, y, width, ftr_h, green.l5);
  const bal_label = `${yr} ${yr > 1 ? "Years" : "Year"} Balance`;
  draw_text_right(
    page,
    bal_label,
    x + width - pad,
    y + 16,
    fonts.semibold,
    fs.sm2
  );
  draw_text_right(
    page,
    to_usd(p.end.total),
    x + width - pad,
    y + 32,
    fonts.bold,
    fs.base,
    green.d
  );
}
