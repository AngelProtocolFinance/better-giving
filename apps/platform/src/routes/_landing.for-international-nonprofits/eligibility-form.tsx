import {
  Combo,
  DrawerIcon,
  ExtLink,
  Honeypot,
  LoadText,
  RmxForm,
} from "@better-giving/ui";
import { useEffect, useRef, useState } from "react";
import {
  countries as cmap,
  country_names as cnames,
} from "#/constants/countries";
import { BOOK_A_DEMO } from "#/constants/urls";
import { SignedInNotice } from "#/pages/@sections/signed-in-notice";
import type { ILeadValues } from "@/reg/lead";

export interface IEligibilityErrors {
  o_name?: string;
  o_hq_country?: string;
  o_registration_number?: string;
  email?: string;
}

type Key = keyof IEligibilityErrors;

/** ask order. the focus move walks this, so a failed submit always lands on
 * the earliest field that needs changing rather than the first one found. */
const fields: readonly [Key, string][] = [
  ["o_name", "Organization name"],
  ["o_hq_country", "Country of registration"],
  ["o_registration_number", "Registration number"],
  ["email", "Work email"],
];

interface IEligibilityForm {
  classes?: string;
  /** per-field messages from the action; a new object per submission */
  errors?: IEligibilityErrors;
  /** what the last submit posted, so a failure repopulates instead of clearing */
  values?: ILeadValues;
  /** the address the browser is signed in as, when it isn't the one posted */
  signed_in_as?: string;
  pending?: boolean;
}

export function EligibilityForm({
  classes = "",
  errors,
  values,
  signed_in_as,
  pending,
}: IEligibilityForm) {
  // seeded, not synced: the client keeps this state across the POST because the
  // form never remounts, and a document POST renders the round trip's value on
  // the first pass. an effect writing it back would arrive too late for the
  // second case and would leave the combobox empty in the served html.
  const [country, set_country] = useState(values?.o_hq_country ?? "");

  const refs = useRef<Record<Key, HTMLElement | null>>({
    o_name: null,
    o_hq_country: null,
    o_registration_number: null,
    email: null,
  });
  const notice_ref = useRef<HTMLDivElement>(null);

  // a refused submit re-renders with focus wherever the round trip left it —
  // usually the button, several fields below whatever has to change. one move
  // scrolls the remedy into view, announces it, and puts the caret in it.
  useEffect(() => {
    if (signed_in_as) {
      notice_ref.current?.focus();
      return;
    }
    if (!errors) return;
    const first = fields.find(([k]) => errors[k])?.[0];
    if (first) refs.current[first]?.focus();
  }, [errors, signed_in_as]);

  return (
    <div
      className={`${classes} bg-panel border border-gray-6 rounded p-5 sm:p-6`}
    >
      <h2 className="text-xl font-bold">
        Check if your organization qualifies
      </h2>
      <p className="text-sm/relaxed text-gray-11 mt-2">
        Three fields to start. We reply within 3 business days.
      </p>

      {signed_in_as && (
        <SignedInNotice ref={notice_ref} classes="mt-4" email={signed_in_as} />
      )}

      <RmxForm
        method="post"
        // a failed submit stays where the form is: the default reset would
        // throw the page back to the top, above everything just marked
        preventScrollReset
        disabled={pending}
        className="grid gap-4 mt-5"
        aria-label="Check if your organization qualifies"
      >
        <input type="hidden" name="o_type" value="other" />
        <Honeypot />

        <div className="grid gap-1.5">
          <label className="label" data-required="true" htmlFor="o_name">
            Organization name
          </label>
          <input
            ref={(el) => {
              refs.current.o_name = el;
            }}
            className="field-input"
            id="o_name"
            name="o_name"
            type="text"
            required
            autoComplete="organization"
            defaultValue={values?.o_name}
            placeholder="Registered legal name"
            aria-invalid={!!errors?.o_name}
            aria-errormessage="o_name-err"
            aria-describedby={errors?.o_name ? "o_name-err" : undefined}
          />
          <p id="o_name-err" className="field-err empty:hidden">
            {errors?.o_name}
          </p>
        </div>

        <Combo
          ref={(el) => {
            refs.current.o_hq_country = el;
          }}
          value={country || undefined}
          on_change={(c) => set_country(c ?? "")}
          on_reset={() => set_country("")}
          required
          clearable
          label="Country of registration"
          placeholder="Select a country"
          options={cnames}
          render={(c) => (
            <>
              <span className="text-2xl">{cmap[c].flag}</span>
              <span>{c}</span>
            </>
          )}
          adornment_side="start"
          adornment={(open) => {
            const flag = cmap[country]?.flag;
            return flag ? (
              <span className="text-2xl">{flag}</span>
            ) : (
              <DrawerIcon is_open={open} size={20} />
            );
          }}
          error={errors?.o_hq_country}
        />
        {/* the combobox input is a search field, not the value — the selection
            is what posts */}
        <input type="hidden" name="o_hq_country" value={country} />

        <div className="grid gap-1.5">
          <label
            className="label"
            data-required="true"
            htmlFor="o_registration_number"
          >
            Registration number
          </label>
          <input
            ref={(el) => {
              refs.current.o_registration_number = el;
            }}
            className="field-input"
            id="o_registration_number"
            name="o_registration_number"
            type="text"
            required
            autoComplete="off"
            defaultValue={values?.o_registration_number}
            placeholder="e.g. 1234567"
            aria-invalid={!!errors?.o_registration_number}
            aria-errormessage="o_registration_number-err"
            aria-describedby={
              errors?.o_registration_number
                ? "o_registration_number-err"
                : undefined
            }
          />
          <p id="o_registration_number-err" className="field-err empty:hidden">
            {errors?.o_registration_number}
          </p>
        </div>

        <div className="grid gap-1.5">
          <label className="label" data-required="true" htmlFor="email">
            Work email
          </label>
          <input
            ref={(el) => {
              refs.current.email = el;
            }}
            className="field-input"
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={values?.email}
            placeholder="you@yourorg.org"
            aria-invalid={!!errors?.email}
            aria-errormessage="email-err"
            aria-describedby={errors?.email ? "email-err" : undefined}
          />
          <p id="email-err" className="field-err empty:hidden">
            {errors?.email}
          </p>
        </div>

        {/* the hero no longer carries a primary link — this is the page's only
            one, so it takes the hero's words */}
        <button type="submit" className="btn btn-lg btn-primary">
          <LoadText is_loading={pending} text="Submitting...">
            Unlock U.S. donors
          </LoadText>
        </button>

        {/* the hero's copy carries this link while the two sit side by side;
            below that the copy's whole button row is gone, so it lands here */}
        <ExtLink
          href={BOOK_A_DEMO}
          className="lg:hidden text-sm font-semibold text-center"
        >
          Book a demo
        </ExtLink>

        <p className="text-xs text-gray-11">
          No setup fee, no minimum, no annual contract. You pay nothing until
          your first donation.
        </p>
      </RmxForm>
    </div>
  );
}
