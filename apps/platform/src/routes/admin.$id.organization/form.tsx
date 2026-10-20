import {
  Form as F,
  Field,
  Fieldset,
  Group,
  type IPrompt,
  Modal,
  Prompt,
  Select,
} from "@better-giving/ui";
import { useRef, useState } from "react";
import { href, Link } from "react-router";
import { CountryCombo } from "#/components/country-combo";
import { ImgEditor } from "#/components/img-editor";
import { emails } from "@/constants/common";
import type { EndowDesignation } from "@/npo";
import type { OrgDesignation } from "@/schemas";
import { logoSpec } from "../admin.$id.edit-profile/schema";
import type { FV } from "./schema";
import { suggest_slug } from "./schema";
import { use_organization_form } from "./use-form";

const endow_designations: EndowDesignation[] = [
  "Charity",
  "Religious Organization",
  "University",
  "Hospital",
  "Other",
];

const note_id = "org_slug_note";
const set_once_note =
  "Changing your org slug would make any links that depend on it stale";

interface Props {
  init: FV;
  id: number;
  base_url: string;
}

export function Form({ init, id, base_url }: Props) {
  const [prompt, set_prompt] = useState<IPrompt>();
  const [lock_open, set_lock_open] = useState(false);
  const cancel_ref = useRef<HTMLButtonElement>(null);
  const form = use_organization_form(init, id, set_prompt);
  const uploading = form.logo.value === "loading";
  const marketplace = `${base_url}${href("/marketplace/:id", { id: init.slug })}`;
  const donate = `${base_url}${href("/donate/:id", { id: init.slug })}`;
  const setting_slug = !form.locked && form.slug !== "";

  return (
    <F
      onSubmit={(e) => e.preventDefault()}
      className="px-6 py-4 md:px-10 md:py-8 w-full max-w-4xl grid grid-cols-1 content-start gap-6"
    >
      {prompt && <Prompt {...prompt} onClose={() => set_prompt(undefined)} />}
      <Modal
        open={lock_open}
        size="panel"
        onClose={() => set_lock_open(false)}
        classes="grid gap-4 bg-panel p-6"
        initialFocusEl={() => cancel_ref.current}
      >
        <h2 className="text-xl font-bold">Lock this address?</h2>
        <p>This address can't be changed later.</p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancel_ref}
            type="button"
            className="btn btn-secondary"
            onClick={() => set_lock_open(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              set_lock_open(false);
              void form.save();
            }}
          >
            Save
          </button>
        </div>
      </Modal>
      <h1 className="text-3xl font-bold">Organization</h1>
      <Fieldset disabled={form.busy} className="contents">
        <Group title="Organization" hide_title>
          <label htmlFor="npo-logo" className="label -mb-4" data-required>
            Logo of your organization
          </label>
          <ImgEditor
            id="npo-logo"
            ref={form.logo.ref}
            value={form.logo.value}
            on_change={(val) => {
              form.logo.onChange(val);
              form.trigger("logo");
            }}
            on_undo={(e) => {
              e.stopPropagation();
              form.resetField("logo");
            }}
            spec={logoSpec}
            classes={{
              container: "mb-4",
              dropzone: "w-28 sm:w-48 aspect-square",
            }}
            error={form.errors.logo?.message}
          />
          <Field
            {...form.register("name")}
            label="Name of your organization"
            disabled
            tooltip={`The name field reflects your organization's legal name as provided on your initial application. If you need to change your name please contact ${emails.hi} and provide documentation supporting the legal name change or D.B.A. records.`}
            error={form.errors.name?.message}
            required
          />
          <Field
            {...form.register("registration_number")}
            name="registration_number"
            label="EIN / Registration#"
            error={form.errors.registration_number?.message}
            required
          />
          <Select<OrgDesignation>
            required
            label="Organization Designation"
            value={form.designation.value}
            onChange={form.designation.onChange}
            classes={{ options: "text-sm" }}
            options={endow_designations}
            error={form.errors.endow_designation?.message}
            ref={form.designation.ref}
            option_disp={(v) => v}
          />
          <CountryCombo
            required
            clearable
            label="Headquarters"
            value={form.hq_country.value || undefined}
            on_change={(c) => form.hq_country.onChange(c ?? "")}
            error={form.errors.hq_country?.message}
            ref={form.hq_country.ref}
          />
          <Field
            {...form.register("slug")}
            label="Org slug"
            disabled={form.locked}
            placeholder={form.locked ? undefined : suggest_slug(form.name)}
            describedby={form.locked ? note_id : undefined}
            error={form.errors.slug?.message}
          />
          {form.locked && (
            <div className="-mt-4 grid gap-2">
              <p
                id={note_id}
                className="text-xs sm:text-sm text-gray-11 italic"
              >
                {set_once_note}
              </p>
              <p className="text-sm break-all">
                Marketplace:{" "}
                <Link to={marketplace} className="link">
                  {marketplace}
                </Link>
              </p>
              <p className="text-sm break-all">
                Donate:{" "}
                <Link to={donate} className="link">
                  {donate}
                </Link>
              </p>
            </div>
          )}
          <button
            type="button"
            disabled={!form.is_dirty || uploading}
            onClick={() => {
              if (setting_slug) {
                set_lock_open(true);
                return;
              }
              void form.save();
            }}
            aria-label="Save organization"
            className="btn btn-primary justify-self-end"
          >
            Save
          </button>
        </Group>
      </Fieldset>
    </F>
  );
}
