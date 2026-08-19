import { ImagePlaceholder } from "platform";

// stands in for an image that is missing or failed to load. It has no
// intrinsic size — the caller's className sets the box, and the lucide glyph
// inside scales to half of it.

export const OrgLogo = () => (
  <ImagePlaceholder className="h-24 w-24 rounded-full" />
);

export const FundraiserCover = () => (
  <ImagePlaceholder className="h-40 w-60 rounded border" />
);

// how a marketplace card renders before its cover image exists.
export const InCard = () => (
  <div className="w-64 bg-card border rounded overflow-clip">
    <ImagePlaceholder className="h-40 w-full" />
    <div className="p-3">
      <h3 className="text-center mb-2">Books for Kids</h3>
      <p className="text-muted-fg text-sm text-center">
        Putting a book in every child's hands.
      </p>
    </div>
  </div>
);

export const Sizes = () => (
  <div className="flex items-end gap-4">
    <ImagePlaceholder className="h-10 w-10 rounded" />
    <ImagePlaceholder className="h-24 w-24 rounded" />
    <ImagePlaceholder className="h-40 w-60 rounded" />
  </div>
);
