import type { PortableTextComponents } from "@portabletext/react";
import { is_absolute_web_href } from "@/helpers/safe-href";

export const pt_components: PortableTextComponents = {
  block: {
    normal: ({ children }) => <p>{children}</p>,
  },
  marks: {
    strong: ({ children }) => <strong>{children}</strong>,
    em: ({ children }) => <em>{children}</em>,
    // react blocks only `javascript:`, and the editor's prompt takes any text,
    // so `www.example.org` would land as a same-origin relative link
    link: ({ children, value }) =>
      is_absolute_web_href(value?.href) ? (
        <a
          href={value.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          {children}
        </a>
      ) : (
        children
      ),
  },
  list: {
    bullet: ({ children }) => <ul className="list-disc pl-6">{children}</ul>,
    number: ({ children }) => (
      <ol className="list-decimal pl-10">{children}</ol>
    ),
  },
};
