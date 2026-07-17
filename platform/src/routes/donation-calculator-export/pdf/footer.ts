import type { PDFDocument, PDFPage } from "pdf-lib";
import { rgb } from "pdf-lib";
import { socials } from "#/constants/urls";
import { blue, fs, gray, w } from "../styles";
import { add_link, draw_wrapped, hex } from "./layout";
import type { Fonts, Images } from "./types";
import { PAGE_H, PAGE_W } from "./types";

const footer_h = 50;

export function draw_footer(
  doc: PDFDocument,
  page: PDFPage,
  fonts: Fonts,
  images: Images
) {
  const y_bottom = 0; // bottom of page in pdf coords
  // background bar
  page.drawRectangle({
    x: 0,
    y: y_bottom,
    width: PAGE_W,
    height: footer_h,
    color: hex(blue.d),
  });

  const baseline_y = footer_h / 2 - fs.xlm / 2 + 4;

  // "Keep in touch!"
  page.drawText("Keep in touch!", {
    x: w["24"],
    y: baseline_y,
    size: fs.xlm,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });

  // social icons — positioned between "Keep in touch!" and copyright block
  const icon_container = 22;
  const icon_gap = w["4"];
  const socials_list = [
    { img: images.icon_linkedin, url: socials.linkedin },
    { img: images.icon_facebook, url: socials.facebook },
    { img: images.icon_x, url: socials.x },
    { img: images.icon_youtube, url: socials.youtube },
    { img: images.icon_instagram, url: socials.instagram },
    { img: images.icon_intercom, url: socials.intercom },
  ];

  // anchor after "Keep in touch!" text
  const kit_w = fonts.bold.widthOfTextAtSize("Keep in touch!", fs.xlm);
  let ix = w["24"] + kit_w + w["14"];
  const icon_cy = footer_h / 2;

  for (const s of socials_list) {
    // white rounded bg
    page.drawRectangle({
      x: ix,
      y: icon_cy - icon_container / 2,
      width: icon_container,
      height: icon_container,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });
    // icon
    const iw = 12;
    const ih = (s.img.height / s.img.width) * iw;
    page.drawImage(s.img, {
      x: ix + (icon_container - iw) / 2,
      y: icon_cy - ih / 2,
      width: iw,
      height: ih,
    });
    // link annotation — footer_y_top in top-down coords
    const footer_y_top = PAGE_H - footer_h;
    add_link(
      doc,
      page,
      ix,
      footer_y_top + (footer_h - icon_container) / 2,
      icon_container,
      icon_container,
      s.url
    );
    ix += icon_container + icon_gap;
  }

  // copyright text — right-aligned, starts after icons
  const copyright = `Copyright \u00A9 ${new Date().getFullYear()} Better Giving. All rights reserved.`;
  const disclaimer =
    "The information provided by Better Giving in this material is for informational and illustrative purposes only, and is subject to change.";
  const cr_x = ix + w["8"];
  const max_w = PAGE_W - cr_x - w["8"];
  const cr_y_top = PAGE_H - footer_h + 6;
  const h1 = draw_wrapped(
    page,
    copyright,
    cr_x,
    cr_y_top,
    fonts.regular,
    fs.sm,
    max_w,
    { color: gray.l6 }
  );
  draw_wrapped(
    page,
    disclaimer,
    cr_x,
    cr_y_top + h1,
    fonts.regular,
    fs.xxs2,
    max_w,
    { color: gray.l6 }
  );
}
