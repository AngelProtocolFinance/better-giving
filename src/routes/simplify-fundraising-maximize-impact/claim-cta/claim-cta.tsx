import { useState } from "react";
import { href, Link } from "react-router";
import type { EndowmentOption } from "#/types/npo";
import { EndowSelector } from "./endow-selector";

export function ClaimCta({ classes = "" }) {
  const [endow, setEndow] = useState<EndowmentOption>();
  return (
    <div className={`flex items-center gap-x-2 gap-y-4 py-4 ${classes}`}>
      <EndowSelector
        value={endow ?? { id: 0, name: "", registration_number: "" }}
        onChange={setEndow}
      />
      <Link
        to={`${href("/register/welcome")}?claim=${endow?.registration_number}`}
        aria-disabled={!endow?.id}
        className="btn btn-primary h-full flex items-center text-sm font-bold rounded px-6 py-2 aria-disabled:bg-muted-fg aria-disabled:text-muted-fg"
      >
        Get Started
      </Link>
    </div>
  );
}
