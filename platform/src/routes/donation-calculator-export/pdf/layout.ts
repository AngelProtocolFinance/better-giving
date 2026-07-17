import {
  type PDFDocument,
  type PDFFont,
  PDFName,
  type PDFPage,
  rgb,
} from "pdf-lib";
import { PAGE_H } from "./types";

// convert hex (#rgb or #rrggbb) to pdf-lib rgb
export function hex(color: string) {
  let r: number;
  let g: number;
  let b: number;
  if (color.length === 4) {
    // #rgb → expand to #rrggbb
    r = Number.parseInt(color[1] + color[1], 16) / 255;
    g = Number.parseInt(color[2] + color[2], 16) / 255;
    b = Number.parseInt(color[3] + color[3], 16) / 255;
  } else {
    r = Number.parseInt(color.slice(1, 3), 16) / 255;
    g = Number.parseInt(color.slice(3, 5), 16) / 255;
    b = Number.parseInt(color.slice(5, 7), 16) / 255;
  }
  return rgb(r, g, b);
}

// top-down y → pdf y (bottom-up)
export function y_pdf(y_top: number) {
  return PAGE_H - y_top;
}

export function draw_rect(
  page: PDFPage,
  x: number,
  y_top: number,
  w: number,
  h: number,
  color: string
) {
  page.drawRectangle({
    x,
    y: y_pdf(y_top + h),
    width: w,
    height: h,
    color: hex(color),
  });
}

export function draw_text(
  page: PDFPage,
  text: string,
  x: number,
  y_top: number,
  font: PDFFont,
  size: number,
  color?: string
) {
  page.drawText(text, {
    x,
    y: y_pdf(y_top),
    size,
    font,
    color: color ? hex(color) : undefined,
  });
}

// draw text right-aligned within a box
export function draw_text_right(
  page: PDFPage,
  text: string,
  x_right: number,
  y_top: number,
  font: PDFFont,
  size: number,
  color?: string
) {
  const w = font.widthOfTextAtSize(text, size);
  draw_text(page, text, x_right - w, y_top, font, size, color);
}

// draw text centered within a range
export function draw_text_center(
  page: PDFPage,
  text: string,
  x_center: number,
  y_top: number,
  font: PDFFont,
  size: number,
  color?: string
) {
  const w = font.widthOfTextAtSize(text, size);
  draw_text(page, text, x_center - w / 2, y_top, font, size, color);
}

// draw a key-value row: label left, value right
export function draw_kv(
  page: PDFPage,
  x: number,
  y_top: number,
  width: number,
  label: string,
  value: string,
  label_font: PDFFont,
  value_font: PDFFont,
  size: number,
  color?: string
) {
  draw_text(page, label, x, y_top, label_font, size, color);
  draw_text_right(page, value, x + width, y_top, value_font, size, color);
}

// word-wrap text, returns total height used
export function draw_wrapped(
  page: PDFPage,
  text: string,
  x: number,
  y_top: number,
  font: PDFFont,
  size: number,
  max_width: number,
  opts?: { color?: string; line_height?: number }
): number {
  const line_h = opts?.line_height ?? size * 1.4;
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > max_width && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  let y = y_top;
  for (const line of lines) {
    draw_text(page, line, x, y + size, font, size, opts?.color);
    y += line_h;
  }
  return lines.length * line_h;
}

// horizontal line
export function draw_hline(
  page: PDFPage,
  x: number,
  y_top: number,
  width: number,
  thickness: number,
  color: string
) {
  draw_rect(page, x, y_top, width, thickness, color);
}

// filled circle (for dots/indicators)
export function draw_dot(
  page: PDFPage,
  cx: number,
  cy_top: number,
  r: number,
  color: string,
  border_color?: string
) {
  page.drawCircle({
    x: cx,
    y: y_pdf(cy_top),
    size: r,
    color: hex(color),
    borderColor: border_color ? hex(border_color) : undefined,
    borderWidth: border_color ? 1 : 0,
  });
}

// add a clickable link annotation
export function add_link(
  doc: PDFDocument,
  page: PDFPage,
  x: number,
  y_top: number,
  w: number,
  h: number,
  url: string
) {
  const y_bottom = y_pdf(y_top + h);
  const annot = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [x, y_bottom, x + w, y_bottom + h],
    Border: [0, 0, 0],
    A: {
      Type: "Action",
      S: "URI",
      URI: url,
    },
  });
  const annot_ref = doc.context.register(annot);

  const existing = page.node.get(PDFName.of("Annots"));
  if (existing) {
    const arr = doc.context.lookup(existing);
    if (arr && "push" in arr) {
      (arr as { push: (ref: unknown) => void }).push(annot_ref);
    }
  } else {
    page.node.set(PDFName.of("Annots"), doc.context.obj([annot_ref]));
  }
}
