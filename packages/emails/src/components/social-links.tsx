import { Link, Section } from "react-email";

const socials = [
  {
    href: "https://www.linkedin.com/company/better-giving/",
    label: "LinkedIn",
  },
  {
    href: "https://www.facebook.com/BetterGivingFB/",
    label: "Facebook",
  },
  {
    href: "https://x.com/BetterDotGiving",
    label: "X",
  },
  {
    href: "https://www.youtube.com/@BetterDotGiving",
    label: "Youtube",
  },
  {
    href: "https://www.instagram.com/better.giving",
    label: "Instagram",
  },
] as const;

export function SocialLinks() {
  return (
    <Section style={{ textAlign: "center", paddingTop: 10 }}>
      {socials.map((social, i) => (
        <Link
          key={social.label}
          href={social.href}
          style={{
            marginRight: i < socials.length - 1 ? 15 : 0,
            color: "#3FA9F5",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          {social.label}
        </Link>
      ))}
    </Section>
  );
}
