import { Breadcrumbs } from "@better-giving/ui";

// items are NavLinks separated by a literal ">". the crumb whose `to` matches
// the current location renders bold and non-clickable; every other crumb is
// underlined. previews mount under a MemoryRouter sitting at "/", so a crumb
// pointing at "/" is the one that shows the active style.

export const Default = () => (
  <Breadcrumbs
    items={[
      { title: "Marketplace", to: "/marketplace", end: true },
      { title: "Rainforest Trust", to: "/marketplace/9" },
      { title: "Donate", to: "/donate/9" },
    ]}
  />
);

// the real marketplace profile header: two crumbs, small type.
export const MarketplaceProfile = () => (
  <Breadcrumbs
    className="text-xs sm:text-sm"
    items={[
      { title: "Marketplace", to: "/marketplace", end: true },
      { title: "Ocean Conservancy", to: "/marketplace/24" },
    ]}
  />
);

export const CurrentPage = () => (
  <Breadcrumbs
    items={[
      { title: "Marketplace", to: "/marketplace", end: true },
      { title: "Books for Kids", to: "/" },
    ]}
  />
);

// each crumb is capped at max-w-xs and truncates rather than wrapping.
export const LongTitle = () => (
  <Breadcrumbs
    items={[
      { title: "Marketplace", to: "/marketplace", end: true },
      {
        title:
          "Rainforest Trust Conservation Action Fund for the Amazon Basin and Guiana Shield",
        to: "/marketplace/9",
      },
    ]}
  />
);
