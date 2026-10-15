import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render_notice } from "./npo-terms-notice-render";

const out_dir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/emails/rendered"
);
mkdirSync(out_dir, { recursive: true });

const { html, text, subject } = await render_notice();
const html_path = join(out_dir, "npo-terms-notice.html");
const text_path = join(out_dir, "npo-terms-notice.txt");
writeFileSync(html_path, html);
writeFileSync(text_path, text);

console.log(subject);
console.log(html_path);
console.log(text_path);
