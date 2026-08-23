import { Button } from "@better-giving/ui";
import { ArrowRight, Trash2 } from "lucide-react";

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="primary">Save changes</Button>
    <Button variant="secondary">Cancel</Button>
    <Button variant="ghost">Skip for now</Button>
    <Button variant="destructive">Delete fundraiser</Button>
    <Button variant="success">Approve</Button>
    <Button variant="warning">Proceed anyway</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="primary" size="sm">
      Small
    </Button>
    <Button variant="primary">Default</Button>
    <Button variant="primary" size="lg">
      Large
    </Button>
  </div>
);

// btn-outline has no color of its own — it reads currentColor. on a band that
// never declared its ink it is invisible, so the preview shows it where it is
// meant to live.
export const OnAColoredBand = () => (
  <div className="surface-primary flex flex-wrap items-center gap-3 p-8 rounded">
    <Button variant="secondary">Get started</Button>
    <Button variant="outline">Book a demo</Button>
  </div>
);

export const Links = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="primary" to="/marketplace">
      Browse nonprofits
    </Button>
    <Button variant="secondary" href="https://github.com" target="_blank">
      View the repository
      <ArrowRight className="size-4" />
    </Button>
  </div>
);

export const Loading = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="primary" is_loading loading_text="Saving...">
      Save changes
    </Button>
    <Button variant="destructive" is_loading>
      Delete fundraiser
    </Button>
  </div>
);

export const Disabled = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="primary" disabled>
      Save changes
    </Button>
    <Button variant="secondary" disabled to="/marketplace">
      Browse nonprofits
    </Button>
  </div>
);

// `icon` is unconstructible without an aria-label — the prop pair is a
// discriminated union, so a nameless icon button does not typecheck.
export const IconOnly = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="ghost" icon aria-label="Delete this row">
      <Trash2 className="size-5" />
    </Button>
    <Button variant="destructive" icon size="sm" aria-label="Delete this row">
      <Trash2 className="size-4" />
    </Button>
  </div>
);
