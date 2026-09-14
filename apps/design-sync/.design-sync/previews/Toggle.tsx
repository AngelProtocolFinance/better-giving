import { Toggle } from "@better-giving/ui";
import { useState } from "react";

export const On = () => {
  const [value, set] = useState(true);
  return (
    <Toggle value={value} onChange={set} classes={{ container: "text-sm" }}>
      Publish profile
    </Toggle>
  );
};

export const Off = () => {
  const [value, set] = useState(false);
  return (
    <Toggle value={value} onChange={set} classes={{ container: "text-sm" }}>
      Publish profile
    </Toggle>
  );
};

export const Required = () => {
  const [value, set] = useState(true);
  return (
    <Toggle
      value={value}
      onChange={set}
      required
      classes={{ container: "text-sm" }}
    >
      Email a receipt for every donation
    </Toggle>
  );
};

export const WithError = () => (
  <Toggle
    value={false}
    onChange={() => {}}
    required
    error="Accept the payout terms to continue"
    // field-err is right-aligned, so the container needs a width for the
    // message to sit under the control instead of the far page edge.
    classes={{ container: "w-80 text-sm" }}
  >
    I accept the payout terms
  </Toggle>
);

export const Disabled = () => (
  <div className="flex flex-col gap-6">
    <Toggle
      value={false}
      onChange={() => {}}
      disabled
      classes={{ container: "text-sm" }}
    >
      Let donors cover processing fees
    </Toggle>
    <Toggle
      value={true}
      onChange={() => {}}
      disabled
      classes={{ container: "text-sm" }}
    >
      Publish profile
    </Toggle>
  </div>
);

export const CustomSize = () => {
  const [value, set] = useState(true);
  return (
    <Toggle
      value={value}
      onChange={set}
      classes={{ container: "text-sm [--toggle-w:3.5rem] [--toggle-h:2rem]" }}
    >
      Publish profile
    </Toggle>
  );
};
