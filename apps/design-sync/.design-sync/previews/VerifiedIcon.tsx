import { VerifiedIcon } from "@better-giving/ui";

// the badge carries a "Verified" tooltip that only opens on hover, so nothing
// extra shows in a static capture — the filled badge itself is the whole
// rendered state.

export const Sizes = () => (
  <div className="flex items-center gap-6">
    {[16, 21, 28, 40].map((size) => (
      <div key={size} className="flex flex-col items-center gap-1">
        <VerifiedIcon size={size} />
        <span className="text-2xs text-muted-fg">{size}px</span>
      </div>
    ))}
  </div>
);

// the marketplace card heading: badge inline before the nonprofit name.
export const BesideOrgName = () => (
  <div className="grid gap-3 w-64">
    <h3 className="text-ellipsis line-clamp-2 text-center">
      <VerifiedIcon classes="inline relative bottom-px mr-1" size={21} />
      <span className="inline">Rainforest Trust</span>
    </h3>
    <h3 className="text-ellipsis line-clamp-2 text-center">
      <VerifiedIcon classes="inline relative bottom-px mr-1" size={21} />
      <span className="inline">Ocean Conservancy</span>
    </h3>
    <h3 className="text-ellipsis line-clamp-2 text-center">
      <span className="inline">Books for Kids</span>
    </h3>
  </div>
);

// the profile header: larger badge next to a page title.
export const OnProfileHeader = () => (
  <div className="w-80 grid gap-1">
    <div className="flex items-center gap-2">
      <h2 className="text-2xl font-semibold">Ocean Conservancy</h2>
      <VerifiedIcon size={28} classes="shrink-0" />
    </div>
    <p className="text-sm text-muted-fg">
      EIN 87-3758939 &bull; Raised $1,200.00 this month
    </p>
  </div>
);

// inline in running text, at the ambient font size.
export const InlineInText = () => (
  <p className="w-96 text-sm">
    Nonprofits marked with{" "}
    <VerifiedIcon size={16} classes="inline relative bottom-px" /> have had
    their registration confirmed against IRS records before their first payout
    on Nov 14, 2025.
  </p>
);
