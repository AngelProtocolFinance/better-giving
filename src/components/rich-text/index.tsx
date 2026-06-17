import type { LinkDescriptor } from "react-router";

export { to_content, to_text } from "./helpers";

// no external stylesheets needed — PT renderer is styled via Tailwind inline
export const richtext_styles: LinkDescriptor[] = [];

export { RichText } from "./rich-text";
