import { Field, Group, Select } from "platform";

// Group is the bordered card that wraps one section of an admin form or
// dashboard: `title` is the section heading, `description` the line under it.

export const ProfileSection = () => (
  <Group
    className="max-w-2xl"
    title="Public profile information"
    description="The following information will be used to populate your public profile."
  >
    <Field
      name="org_name"
      label="Name of your organization"
      required
      disabled
      defaultValue="Rainforest Trust"
      tooltip="Reflects the legal name on your initial application."
    />
    <Field
      name="tagline"
      label="Tagline"
      required
      defaultValue="Protecting threatened tropical forests, acre by acre."
    />
    <Field name="ein" label="EIN" required disabled defaultValue="87-3758939" />
  </Group>
);

export const BankAccountSection = () => (
  <Group
    className="max-w-2xl"
    title="Bank account details"
    description="Used to register the account your funds are withdrawn to."
  >
    <Select
      label="Country of the bank account"
      required
      value="United States"
      options={["United States", "United Kingdom", "Philippines"]}
      option_disp={(o) => o}
      onChange={() => {}}
    />
    <Field
      name="payout_min"
      label="Minimum payout"
      sub="We hold funds until the balance clears this amount."
      defaultValue="50"
    />
    <div className="flex gap-3">
      <button type="button" className="btn btn-primary px-6">
        Save changes
      </button>
      <button type="button" className="btn btn-secondary px-6">
        Reset
      </button>
    </div>
  </Group>
);

// no description: the leaner variant used on the program editor.
export const TitleOnly = () => (
  <Group className="max-w-2xl" title="Next payout">
    <dl className="grid gap-4">
      <div className="flex items-baseline justify-between">
        <dt className="text-sm text-muted-fg">Available balance</dt>
        <dd className="text-2xl font-semibold">$1,200.00</dd>
      </div>
      <div className="flex items-baseline justify-between">
        <dt className="text-sm text-muted-fg">Scheduled for</dt>
        <dd className="text-sm font-medium">Nov 14, 2025</dd>
      </div>
      <div className="flex items-baseline justify-between">
        <dt className="text-sm text-muted-fg">Destination</dt>
        <dd className="text-sm font-medium">
          Wells Fargo &bull;&bull;&bull;&bull; 4821
        </dd>
      </div>
    </dl>
  </Group>
);

// children only — the plain bordered panel, no heading at all.
export const Untitled = () => (
  <Group className="max-w-2xl">
    <p className="text-sm text-muted-fg">
      Ocean Conservancy has no fundraisers yet. Create one to start collecting
      donations.
    </p>
    <button type="button" className="btn btn-primary justify-self-start px-6">
      Create a fundraiser
    </button>
  </Group>
);
