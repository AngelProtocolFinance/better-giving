import type { PDFDocument, PDFPage } from "pdf-lib";
import { to_usd } from "#/helpers/to-usd";
import type { View } from "#/routes/_app.donation-calculator/types";
import { amber, blue, fs, green, w } from "../styles";
import { type ChartPoint, draw_chart } from "./chart";
import {
  draw_dot,
  draw_rect,
  draw_text,
  draw_text_right,
  draw_wrapped,
} from "./layout";
import type { Fonts, Images } from "./types";
import { PAGE_W } from "./types";

const row1 = [
  { key: 5, label: "Short-Term Impact ( 5-Year View )" },
  { key: 10, label: "Momentum Building ( 10-Year View )" },
];
const row2 = [
  { key: 15, label: "Strategic Growth Horizon ( 15-Year View )" },
  { key: 20, label: "Long-Term Transformation ( 20-Year View )" },
];

export function draw_page2(
  _doc: PDFDocument,
  page: PDFPage,
  v: View,
  fonts: Fonts,
  _images: Images
) {
  const px = w["20"];
  const content_w = PAGE_W - px * 2;

  // === header ===
  let y: number = px;
  const title = "TOTAL 5 - 10 - 15 - 20 YEARS FINANCIAL ADVANTAGE";
  draw_text(page, title, px, y + fs.lg2, fonts.semibold, fs.lg2, blue.d);
  const title_w = fonts.semibold.widthOfTextAtSize(title, fs.lg2);
  draw_rect(
    page,
    px + title_w + w["4"],
    y + fs.lg2 / 2,
    content_w - title_w - w["4"],
    2,
    blue.d
  );
  y += fs.lg2 + 2;
  draw_text(
    page,
    "(ESTIMATED PREDICTIONS)",
    px,
    y + fs.lg2,
    fonts.semibold,
    fs.lg2,
    blue.d
  );
  y += fs.lg2 + w["6"];
  draw_text(
    page,
    "Compound Growth = Exponential Impact",
    px,
    y + fs.lg,
    fonts.bold,
    fs.lg
  );
  y += fs.lg + w["10"];

  // === chart rows ===
  const col_w = (content_w - w["10"]) / 2;
  const chart_w = col_w;
  const chart_h = 220;

  function draw_row(
    rows: { key: number; label: string }[],
    y_start: number
  ): number {
    let max_h = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cx = px + i * (col_w + w["10"]);
      let cy = y_start;

      // label
      draw_text(page, row.label, cx, cy + fs.base, fonts.regular, fs.base);
      cy += fs.base + w["4"];

      // splits
      cy = draw_splits(page, cx, cy, col_w, v, fonts);
      cy += w["2"];

      // chart
      const data: ChartPoint[] = v.projection
        .slice(0, row.key)
        .map((x, idx) => {
          const yr = idx + 1;
          return {
            year: yr.toString(),
            amount: v.amount,
            liq: x.liq,
            savings: v.advantage * yr,
            lock: x.lock,
            total: v.advantage * yr + x.total,
          };
        });

      draw_chart(page, data, fonts, {
        x: cx,
        y_top: cy,
        width: chart_w,
        height: chart_h,
      });

      const row_h = cy + chart_h - y_start;
      if (row_h > max_h) max_h = row_h;
    }
    return y_start + max_h;
  }

  y = draw_row(row1, y);
  y += w["10"];
  y = draw_row(row2, y);

  // === legend ===
  y += w["6"];
  const legend_items = [
    {
      color: green.l1,
      border: green.d1,
      label: "Donation Processing Savings",
      text_color: green.d1,
    },
    {
      color: amber.l1,
      border: amber.d1,
      label: "Savings Returns",
      text_color: amber.l1,
    },
    {
      color: blue.l1,
      border: blue.d,
      label: "Investment Returns",
      text_color: blue.l1,
    },
    {
      color: blue.d,
      border: undefined,
      label: "Total Financial Advantage",
      text_color: blue.d,
    },
  ];

  const legend_total_w = legend_items.reduce(
    (sum, item) =>
      sum +
      12 +
      w["2"] +
      fonts.regular.widthOfTextAtSize(item.label, fs.sm) +
      w["10"],
    0
  );
  let lx = (PAGE_W - legend_total_w) / 2;
  for (const item of legend_items) {
    draw_dot(page, lx + 3, y + 4, 3, item.color, item.border);
    draw_text(
      page,
      item.label,
      lx + 10,
      y + fs.sm - 1,
      fonts.regular,
      fs.sm,
      item.text_color
    );
    lx +=
      12 +
      w["2"] +
      fonts.regular.widthOfTextAtSize(item.label, fs.sm) +
      w["10"];
  }

  // === callout boxes ===
  y += w["20"];
  const box_px = w["10"];
  const box_py = w["10"];
  const box_w = content_w - w["4"];

  // amber callout — measure text height first, then draw bg
  const amber_text =
    "Investment yields based on average annual returns over past 5 years (4% for Savings Account, 20% for Sustainability Fund)";
  const amber_text_h = draw_wrapped(
    page,
    amber_text,
    w["22"] + box_px,
    y + box_py,
    fonts.regular,
    fs.sm2,
    box_w - box_px * 2,
    { color: amber.d3 }
  );
  const amber_h = amber_text_h + box_py * 2;
  // draw bg behind text (draw after since pdf-lib layers by draw order — redraw text)
  draw_rect(page, w["22"], y, box_w, amber_h, amber.l4);
  draw_wrapped(
    page,
    amber_text,
    w["22"] + box_px,
    y + box_py,
    fonts.regular,
    fs.sm2,
    box_w - box_px * 2,
    { color: amber.d3 }
  );
  y += amber_h + w["8"];

  // blue callout
  const blue_title_h = fs.lg + w["4"];
  const blue_body =
    "These projections demonstrate how Better Giving's integrated approach compounds over time. Our organization could accumulate significant additional funds through the combination of reduced processing fees, expanded donation types, and strategic investments.";
  const blue_body_h = draw_wrapped(
    page,
    blue_body,
    w["22"] + box_px,
    y + box_py + blue_title_h,
    fonts.regular,
    fs.sm2,
    box_w - box_px * 2,
    { color: blue.d2 }
  );
  const blue_h = box_py + blue_title_h + blue_body_h + box_py;
  draw_rect(page, w["22"], y, box_w, blue_h, blue.l4);
  draw_text(
    page,
    "The Power of Compound Growth",
    w["22"] + box_px,
    y + box_py + fs.lg,
    fonts.medium,
    fs.lg,
    blue.d3
  );
  draw_wrapped(
    page,
    blue_body,
    w["22"] + box_px,
    y + box_py + blue_title_h,
    fonts.regular,
    fs.sm2,
    box_w - box_px * 2,
    { color: blue.d2 }
  );
}

function draw_splits(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  v: View,
  fonts: Fonts
): number {
  const col = width / 3;
  const xxs = 7;
  const items = [
    {
      top: "Annual Saved/Invested",
      bottom: to_usd(v.notGranted),
    },
    {
      top: `Annual Saved (${(v.savingsRate * 100).toFixed(0)}%)`,
      bottom: to_usd(v.savings),
    },
    {
      top: `Annual Invested (${(v.investedRate * 100).toFixed(0)}%)`,
      bottom: to_usd(v.invested),
    },
  ];

  for (let i = 0; i < items.length; i++) {
    const ix = x + i * col;
    draw_text_right(
      page,
      items[i].top,
      ix + col - 2,
      y + xxs,
      fonts.semibold,
      xxs
    );
    draw_text_right(
      page,
      items[i].bottom,
      ix + col - 2,
      y + xxs * 2 + 2,
      fonts.regular,
      xxs
    );
  }

  return y + xxs * 2 + 6;
}
