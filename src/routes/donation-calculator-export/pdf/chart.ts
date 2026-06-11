import type { PDFPage } from "pdf-lib";
import { amber, blue, gray, green } from "../styles";
import { draw_text, hex, y_pdf } from "./layout";
import type { Fonts } from "./types";

export interface ChartPoint {
  year: string;
  amount: number;
  liq: number;
  savings: number;
  lock: number;
  total: number;
}

interface ChartOpts {
  x: number;
  y_top: number;
  width: number;
  height: number;
  margin?: { top: number; right: number; bottom: number; left: number };
}

export function draw_chart(
  page: PDFPage,
  points: ChartPoint[],
  fonts: Fonts,
  opts: ChartOpts
) {
  const {
    x: ox,
    y_top,
    width,
    height,
    margin = { top: 10, right: 10, bottom: 30, left: 40 },
  } = opts;

  const chart_w = width - margin.left - margin.right;
  const chart_h = height - margin.top - margin.bottom;

  const max_val = Math.max(...points.map((p) => p.savings + p.liq + p.lock));
  const axis_max = Math.ceil(max_val / 100000) * 100000;

  // local x/y scales — return absolute page coordinates
  const xs = (i: number) =>
    ox + margin.left + (i / (points.length - 1)) * chart_w;
  // chart-local y in top-down coords, then convert to pdf
  const ys = (val: number) =>
    y_top + margin.top + chart_h - (val / axis_max) * chart_h;

  // draw filled area using vertical strip approximation
  function fill_area(
    keys: (keyof ChartPoint)[],
    fill_color: string,
    stroke_color: string
  ) {
    // draw as a series of thin trapezoids approximated as rectangles
    for (let i = 0; i < points.length - 1; i++) {
      const cum1 = keys.reduce((s, k) => s + Number(points[i][k]), 0);
      const cum2 = keys.reduce((s, k) => s + Number(points[i + 1][k]), 0);
      const base_keys = keys.slice(0, -1);
      const base1 = base_keys.reduce((s, k) => s + Number(points[i][k]), 0);
      const base2 = base_keys.reduce((s, k) => s + Number(points[i + 1][k]), 0);

      const x1 = xs(i);
      const x2 = xs(i + 1);

      // draw as polygon using page.drawLine for edges, fill with thin rects
      // simpler: just use moveTo/lineTo path operations
      // pdf-lib doesn't have a fill-path API easily, so draw vertical strips
      const steps = 20;
      const dx = (x2 - x1) / steps;
      for (let s = 0; s < steps; s++) {
        const t1 = s / steps;
        const t2 = (s + 1) / steps;
        const top_y = y_pdf(ys(cum1 + (cum2 - cum1) * ((t1 + t2) / 2)));
        const bot_y = y_pdf(ys(base1 + (base2 - base1) * ((t1 + t2) / 2)));
        const strip_x = x1 + dx * s;
        const strip_h = top_y - bot_y;
        if (strip_h > 0.5) {
          page.drawRectangle({
            x: strip_x,
            y: bot_y,
            width: dx + 0.5, // slight overlap to avoid gaps
            height: strip_h,
            color: hex(fill_color),
            borderWidth: 0,
          });
        }
      }
    }

    // draw stroke line along top
    for (let i = 0; i < points.length - 1; i++) {
      const cum1 = keys.reduce((s, k) => s + Number(points[i][k]), 0);
      const cum2 = keys.reduce((s, k) => s + Number(points[i + 1][k]), 0);
      page.drawLine({
        start: { x: xs(i), y: y_pdf(ys(cum1)) },
        end: { x: xs(i + 1), y: y_pdf(ys(cum2)) },
        thickness: 1,
        color: hex(stroke_color),
      });
    }
  }

  // draw areas bottom to top
  fill_area(["savings"], green.l3, green.d1);
  fill_area(["savings", "liq"], amber.l1, amber.d);
  fill_area(["savings", "liq", "lock"], blue.l1, blue.d);

  // total line
  for (let i = 0; i < points.length - 1; i++) {
    page.drawLine({
      start: { x: xs(i), y: y_pdf(ys(points[i].total)) },
      end: { x: xs(i + 1), y: y_pdf(ys(points[i + 1].total)) },
      thickness: 2,
      color: hex(blue.d1),
    });
  }

  // x-axis
  page.drawLine({
    start: { x: ox + margin.left, y: y_pdf(ys(0)) },
    end: { x: ox + width - margin.right, y: y_pdf(ys(0)) },
    thickness: 1,
    color: hex(gray.d1),
  });

  // y-axis
  page.drawLine({
    start: { x: ox + margin.left, y: y_pdf(y_top + margin.top) },
    end: { x: ox + margin.left, y: y_pdf(ys(0)) },
    thickness: 1,
    color: hex(gray.d1),
  });

  // y-axis ticks
  const num_ticks = 5;
  for (let i = 0; i <= num_ticks; i++) {
    const val = (axis_max / num_ticks) * i;
    const tick_y = ys(val);

    let label: string;
    if (val >= 1_000_000) {
      label = `$${(val / 1_000_000).toFixed(1)}M`;
    } else if (val >= 1000) {
      label = `$${(val / 1000).toFixed(0)}K`;
    } else {
      label = `$${val}`;
    }

    // tick mark
    page.drawLine({
      start: { x: ox + margin.left - 5, y: y_pdf(tick_y) },
      end: { x: ox + margin.left, y: y_pdf(tick_y) },
      thickness: 1,
      color: hex(gray.d1),
    });

    // label — center vertically on tick mark
    const label_w = fonts.regular.widthOfTextAtSize(label, 8);
    draw_text(
      page,
      label,
      ox + margin.left - 8 - label_w,
      tick_y + 4 + 8,
      fonts.regular,
      8
    );

    // grid line
    if (i > 0) {
      page.drawLine({
        start: { x: ox + margin.left, y: y_pdf(tick_y) },
        end: { x: ox + width - margin.right, y: y_pdf(tick_y) },
        thickness: 0.5,
        color: hex(gray.l2),
        dashArray: [3, 3],
      });
    }
  }

  // x-axis ticks
  for (let i = 0; i < points.length; i++) {
    const show =
      i % Math.ceil(points.length / 10) === 0 || i === points.length - 1;
    if (!show) continue;

    const tx = xs(i);
    const base_y = ys(0);

    page.drawLine({
      start: { x: tx, y: y_pdf(base_y) },
      end: { x: tx, y: y_pdf(base_y) - 5 },
      thickness: 1,
      color: hex("#666666"),
    });

    const lbl = points[i].year;
    const lbl_w = fonts.regular.widthOfTextAtSize(lbl, 8);
    draw_text(page, lbl, tx - lbl_w / 2, base_y + 8 + 8, fonts.regular, 8);
  }
}
