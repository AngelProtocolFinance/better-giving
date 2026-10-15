import { npo_terms_notice } from "emails";
import { pretty, render } from "react-email";

const with_newline = (value: string): string =>
  value.endsWith("\n") ? value : `${value}\n`;

/**
 * wide lines so a placeholder or the footer is not split across a wrap.
 * prettier's default width breaks `[EFFECTIVE DATE]` inside the title.
 */
const print_width = 10_000;

/** html and plain text for the notice. does not send. */
export const render_notice = async (
  data?: Parameters<typeof npo_terms_notice.template>[0]
) => {
  const { node, subject } = npo_terms_notice.template(data);
  const [html, text] = await Promise.all([
    render(node).then((raw) => pretty(raw, { printWidth: print_width })),
    render(node, { plainText: true }),
  ]);
  return {
    subject,
    html: with_newline(html),
    text: with_newline(text),
    plain_body: with_newline(npo_terms_notice.plain_body(data)),
  };
};
