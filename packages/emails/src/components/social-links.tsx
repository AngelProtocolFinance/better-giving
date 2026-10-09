import { socials } from "@better-giving/brand";
import { Fragment } from "react";
import { Section } from "react-email";
import { Link } from "./link";

// `socials` is keyed, not ordered — the display order is spelled out here.
const links = [
  { href: socials.linkedin, label: "LinkedIn" },
  { href: socials.facebook, label: "Facebook" },
  { href: socials.x, label: "X" },
  { href: socials.youtube, label: "Youtube" },
  { href: socials.instagram, label: "Instagram" },
] as const;

export function SocialLinks() {
  return (
    <Section style={{ textAlign: "center", paddingTop: 10 }}>
      {links.map((social, i) => (
        <Fragment key={social.label}>
          {/* zero-width in html; whitespace to html-to-text, so the text
          part's adjacent urls don't fuse into one auto-linked run */}
          {i > 0 && "\u200b"}
          <Link
            href={social.href}
            style={{
              marginRight: i < links.length - 1 ? 15 : 0,
              textDecoration: "none",
              fontSize: 14,
            }}
          >
            {social.label}
          </Link>
        </Fragment>
      ))}
    </Section>
  );
}
