import { useLocation } from "react-router";
import { Footer } from "#/components/footer";
import { AppHeader, MarketingHeader } from "#/components/header";

type Chrome = "marketing" | "minimal" | "bare";

// single source of truth for public chrome intent buckets:
//   bare      — auth funnel (login/signup/register); logo-only, no footer
//   minimal   — transactional/browse (marketplace/fundraisers/funds/profile/
//               forms); logo + auth-aware avatar
//   marketing — everything else (about-us, blog, product, donor, resources,
//               donation-calculator, wp-plugin, zapier-integration, privacy/
//               security/terms, fund-management, fiscal-sponsorship, pricing,
//               open-source, donation-forms, giving-tuesday); full marketing
//               nav + footer
export function chrome_for(pathname: string): Chrome {
  if (/^\/(login|signup|register)(\/|$)/.test(pathname)) return "bare";
  if (/^\/(marketplace|fundraisers|funds|profile|forms)(\/|$)/.test(pathname)) {
    return "minimal";
  }
  return "marketing";
}

interface IPublicHeader {
  classes?: string;
}

export function PublicHeader({ classes }: IPublicHeader) {
  const { pathname } = useLocation();
  const chrome = chrome_for(pathname);

  if (chrome === "marketing") return <MarketingHeader classes={classes} />;
  if (chrome === "minimal")
    return <AppHeader variant="minimal" classes={classes} />;
  return <AppHeader variant="bare" classes={classes} />;
}

export function PublicFooter() {
  const { pathname } = useLocation();
  const chrome = chrome_for(pathname);

  if (chrome === "marketing") return <Footer />;
  if (chrome === "minimal") return <Footer variant="minimal" />;
  return null;
}
