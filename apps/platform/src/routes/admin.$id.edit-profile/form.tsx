import {
  Confirmed,
  Form as F,
  Field,
  Group,
  Info,
  type IPrompt,
  MultiCombo,
  Prompt,
  Select,
  Toggle,
  UrlInput,
} from "@better-giving/ui";
import { useState } from "react";
import { href, Link, Outlet } from "react-router";
import { CountryCombo } from "#/components/country-combo";
import { ImgEditor } from "#/components/img-editor";
import { RichText } from "#/components/rich-text";
import { country_names } from "#/constants/countries";
import { emails } from "@/constants/common";
import type { EndowDesignation } from "@/npo";
import type { OrgDesignation } from "@/schemas";
import type { FV } from "./schema";
import { bannerSpec, cardImgSpec, logoSpec, MAX_CHARS } from "./schema";
import { Slug, slug_notes } from "./slug";
import {
  use_general,
  use_organization,
  use_publish,
  use_social_media,
} from "./use-edit-profile";

const endowDesignations: EndowDesignation[] = [
  "Charity",
  "Religious Organization",
  "University",
  "Hospital",
  "Other",
];

interface Props {
  init_slug?: string;
  init: FV;
  id: number;
  base_url: string;
}

export function Form({ init_slug = "", init, id, base_url }: Props) {
  const [prompt, set_prompt] = useState<IPrompt>();
  const general = use_general(init, id, set_prompt);
  const organization = use_organization(init, set_prompt);
  const social_media = use_social_media(init, set_prompt);
  const {
    published,
    publish,
    busy: publishing,
  } = use_publish(init, set_prompt);
  const isUploading = [
    general.logo.value,
    general.card_img.value,
    general.banner.value,
  ].some((v) => v === "loading");

  const save_button = (
    group: { is_dirty: boolean; save: () => void },
    label: string,
    blocked = false
  ) => (
    <button
      type="button"
      disabled={!group.is_dirty || blocked}
      onClick={group.save}
      // three identical "Save" buttons on one page: the group rides in the
      // accessible name so each still announces what it saves
      aria-label={label}
      className="btn btn-primary justify-self-end"
    >
      Save
    </button>
  );

  return (
    <F
      // saves go through each group's button; an untyped nested button or an
      // enter keypress must not fire a native GET submission
      onSubmit={(e) => e.preventDefault()}
      className="px-6 py-4 md:px-10 md:py-8 w-full max-w-4xl grid grid-cols-1 content-start gap-6"
    >
      {prompt && <Prompt {...prompt} onClose={() => set_prompt(undefined)} />}
      <h1 className="text-3xl font-bold">Public profile information</h1>
      <fieldset disabled={general.busy} className="contents">
        <Group title="General" hide_title>
          <Field
            {...general.register("name")}
            label="Name of your organization"
            disabled
            tooltip={`The name field reflects your organization's legal name as provided on your initial application. If you need to change your name please contact ${emails.hi} and provide documentation supporting the legal name change or D.B.A. records.`}
            error={general.errors.name?.message}
            required
          />
          <Field
            {...general.register("tagline")}
            name="tagline"
            label="Tagline of your organization"
            required
            error={general.errors.tagline?.message}
          />
          <Field
            {...general.register("registration_number")}
            name="registration_number"
            label="EIN / Registration#"
            error={general.errors.registration_number?.message}
            required
          />
          <p className="label -mb-4">Banner image of your organization</p>
          <ImgEditor
            ref={general.banner.ref}
            value={general.banner.value}
            on_change={(val) => {
              general.banner.onChange(val);
              // trigger validation - this opts for onChange validation instead of onSubmit
              general.trigger("image");
            }}
            on_undo={(e) => {
              e.stopPropagation();
              general.resetField("image");
            }}
            spec={bannerSpec}
            classes={{ container: "mb-4", dropzone: "w-full aspect-4/1" }}
            error={general.errors.image?.message}
          />
          <p className="label -mb-4">Logo of your organization</p>
          <ImgEditor
            ref={general.logo.ref}
            value={general.logo.value}
            on_change={(val) => {
              general.logo.onChange(val);
              general.trigger("logo");
            }}
            on_undo={(e) => {
              e.stopPropagation();
              general.resetField("logo");
            }}
            spec={logoSpec}
            classes={{
              container: "mb-4",
              dropzone: "w-28 sm:w-48 aspect-square",
            }}
            error={general.errors.logo?.message}
          />
          <p className="label -mb-4">
            Marketplace Card image for your organization
          </p>
          <ImgEditor
            ref={general.card_img.ref}
            value={general.card_img.value}
            on_change={(val) => {
              general.card_img.onChange(val);
              general.trigger("card_img");
            }}
            on_undo={(e) => {
              e.stopPropagation();
              general.resetField("card_img");
            }}
            spec={cardImgSpec}
            classes={{
              container: "mb-4",
              dropzone: "w-full sm:w-96 aspect-2/1",
            }}
            error={general.errors.card_img?.message}
          />
          <p className="label -mb-4">Description of your organization</p>
          <RichText
            ref={general.overview.ref}
            content={general.overview.value}
            onChange={general.overview.onChange}
            placeHolder="A short overview of your organization"
            charLimit={MAX_CHARS}
            classes={{
              field:
                "rich-text-toolbar border text-sm grid grid-rows-[auto_1fr] rounded bg-surface p-3 min-h-60",
              counter: "text-gray-11",
              error: "text-right",
            }}
            error={
              general.errors.overview?.value?.message ||
              general.errors.overview?.length?.message
            }
          />
          <p className="static field-error -mt-4 empty:hidden">
            {general.errors.overview?.message}
          </p>

          <UrlInput
            {...general.register("url")}
            label="Website of your organization"
            placeholder="website.org"
            error={general.errors.url?.message}
          />

          <Slug
            base_url={base_url}
            init_slug={init_slug}
            new_slug={general.slug}
            slug_field={
              <Field
                {...general.register("slug")}
                label="Custom Profile URL"
                describedby={slug_notes}
                placeholder="myNonprofit"
                error={general.errors.slug?.message}
              />
            }
          />
          {save_button(general, "Save general", isUploading)}
        </Group>
      </fieldset>

      <fieldset disabled={organization.busy} className="contents">
        <Group title="Organization">
          <Select<OrgDesignation>
            required
            label="Organization Designation"
            value={organization.designation.value}
            onChange={organization.designation.onChange}
            classes={{ options: "text-sm" }}
            options={endowDesignations}
            error={organization.errors.endow_designation?.message}
            ref={organization.designation.ref}
            option_disp={(v) => v}
          />

          <CountryCombo
            required
            clearable
            label="Headquarters"
            value={organization.hq_country.value || undefined}
            on_change={(c) => organization.hq_country.onChange(c ?? "")}
            error={organization.errors.hq_country?.message}
            ref={organization.hq_country.ref}
          />
          <MultiCombo
            label="Active countries"
            values={organization.active_in_countries.value}
            on_change={organization.active_in_countries.onChange}
            ref={organization.active_in_countries.ref}
            on_reset={() => organization.resetField("active_in_countries")}
            options={country_names}
            classes={{
              container: "bg-surface",
              options: "text-sm",
            }}
          />
          <Field
            {...organization.register("street_address")}
            label="Address"
            error={organization.errors.street_address?.message}
          />
          {save_button(organization, "Save organization")}
        </Group>
      </fieldset>

      <fieldset disabled={social_media.busy} className="contents">
        <Group title="Social Media">
          <UrlInput
            {...social_media.register("social_media_urls.facebook")}
            label="Facebook"
            placeholder="facebook.com/"
            error={social_media.errors.social_media_urls?.facebook?.message}
          />
          <UrlInput
            {...social_media.register("social_media_urls.linkedin")}
            label="LinkedIn"
            placeholder="linkedin.com/"
            error={social_media.errors.social_media_urls?.linkedin?.message}
          />
          <UrlInput
            {...social_media.register("social_media_urls.twitter")}
            label="X (fka Twitter)"
            placeholder="x.com/"
            error={social_media.errors.social_media_urls?.twitter?.message}
          />
          <UrlInput
            {...social_media.register("social_media_urls.instagram")}
            label="Instagram"
            placeholder="instagram.com/"
            error={social_media.errors.social_media_urls?.instagram?.message}
          />
          <UrlInput
            {...social_media.register("social_media_urls.youtube")}
            label="YouTube"
            placeholder="youtube.com/"
            error={social_media.errors.social_media_urls?.youtube?.message}
          />
          <UrlInput
            {...social_media.register("social_media_urls.tiktok")}
            label="Tiktok"
            placeholder="tiktok.com/"
            error={social_media.errors.social_media_urls?.tiktok?.message}
          />
          <UrlInput
            {...social_media.register("social_media_urls.discord")}
            label="Discord"
            placeholder="discord.com/"
            error={social_media.errors.social_media_urls?.discord?.message}
          />
          {save_button(social_media, "Save social media")}
        </Group>
      </fieldset>

      <div
        className={`flex flex-wrap justify-between items-center border rounded p-3 gap-4 ${
          published
            ? "bg-success-subtle border-success"
            : "bg-warning-subtle border-warning"
        }`}
      >
        {published ? (
          <Confirmed>Your profile is visible in the marketplace</Confirmed>
        ) : (
          <Info classes="text-warning-subtle-fg">
            Your profile is not visible in the marketplace
          </Info>
        )}
        <div className="flex items-center gap-x-2">
          <Toggle
            value={published}
            onChange={publish}
            disabled={publishing}
            classes={{ container: "ml-auto text-sm" }}
          >
            Publish profile
          </Toggle>

          <Link
            target="_blank"
            to={href("/marketplace/:id", { id: id.toString() })}
            className="link text-sm flex items-center gap-1"
          >
            View Profile
          </Link>
        </div>
      </div>

      {/** success prompts */}
      <Outlet />
    </F>
  );
}
