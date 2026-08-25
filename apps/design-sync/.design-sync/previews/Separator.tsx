import { Separator } from "@better-giving/ui";

// the rules are ::before/::after that grow to fill the row, so every cell
// constrains the width — unbounded, the label sits centred in a very wide row.
// the label is a flex item too, so a multi-word one needs whitespace-nowrap or
// the rules squeeze it onto two lines.

export const Labeled = () => (
  <div className="w-80 grid gap-6">
    <Separator classes="before:mr-3.5 after:ml-3.5 before:bg-gray-6 after:bg-gray-6 font-medium text-xs text-gray-11">
      OR
    </Separator>
    <Separator classes="before:mr-3.5 after:ml-3.5 before:bg-gray-6 after:bg-gray-6 font-medium text-sm text-gray-11">
      <span className="whitespace-nowrap">Payment details</span>
    </Separator>
    <Separator classes="before:mr-3.5 after:ml-3.5 before:bg-gray-6 after:bg-gray-6 font-semibold text-xs uppercase tracking-badge text-gray-11">
      <span className="whitespace-nowrap">More ways to give</span>
    </Separator>
  </div>
);

// the login/signup pattern: social button, separator, email form.
export const BetweenSignInOptions = () => (
  <div className="w-80 grid">
    <button type="button" className="btn btn-secondary h-12 rounded">
      Continue with Google
    </button>
    <Separator classes="my-4 before:mr-3.5 after:ml-3.5 before:bg-gray-6 after:bg-gray-6 font-medium text-xs text-gray-11">
      OR
    </Separator>
    <input
      className="field-input"
      placeholder="Email address"
      defaultValue="donations@rainforesttrust.org"
      readOnly
    />
    <button type="button" className="btn btn-primary h-12 rounded mt-3">
      Continue with email
    </button>
  </div>
);

// the bank-details pattern: a bare rule closing one section of a form.
export const Unlabeled = () => (
  <div className="w-80 grid gap-1">
    <p className="text-sm text-gray-11">Payout amount</p>
    <p className="text-2xl font-semibold">$1,200.00</p>
    <Separator classes="my-3 before:bg-gray-6 after:bg-gray-6" />
    <p className="text-sm text-gray-11">
      Arrives at Ocean Conservancy by Nov 14, 2025.
    </p>
  </div>
);

export const SectionLabel = () => (
  <div className="w-80 grid gap-3">
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-gray-11">Donation to Books for Kids</span>
      <span className="font-semibold">$250.00</span>
    </div>
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-gray-11">Tip to Better Giving</span>
      <span className="font-semibold">$12.50</span>
    </div>
    <Separator classes="my-1 before:mr-3.5 after:ml-3.5 before:bg-gray-6 after:bg-gray-6 font-semibold text-xs uppercase tracking-badge text-gray-11">
      <span className="whitespace-nowrap">Payment details</span>
    </Separator>
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-gray-11">Card ending 4242</span>
      <span className="font-semibold">Nov 14, 2025</span>
    </div>
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-gray-11">Total charged</span>
      <span className="font-semibold">$262.50</span>
    </div>
  </div>
);
