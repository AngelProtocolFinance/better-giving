import {
  Confirmed,
  Form as F,
  Field,
  Fieldset,
  Group,
  Info,
  type IPrompt,
  MultiCombo,
  Prompt,
  Toggle,
  UrlInput,
} from "@better-giving/ui";
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { href, Link, Outlet } from "react-router";
import { ImgEditor } from "#/components/img-editor";
import { RichText } from "#/components/rich-text";
import { country_names } from "@/constants/countries";
import type { FV } from "./schema";
import { bannerSpec, cardImgSpec, MAX_CHARS } from "./schema";
import {
  use_general,
  use_organization,
  use_publish,
  use_social_media,
} from "./use-edit-profile";

interface Props {
  profile_slug?: string;
  init: FV;
  id: number;
  base_url: string;
}

export function Form({ profile_slug = "", init, id, base_url }: Props) {
  const [prompt, set_prompt] = useState<IPrompt>();
  const general = use_general(init, set_prompt);
  const organization = use_organization(init, set_prompt);
  const social_media = use_social_media(init, set_prompt);
  const {
    published,
    publish,
    busy: publishing,
  } = use_publish(init, set_prompt);
  const isUploading = [general.card_img.value, general.banner.value].some(
    (v) => v === "loading"
  );
  const profile_id = profile_slug || String(id);
  const profile_url = `${base_url}${href("/marketplace/:id", { id: profile_id })}`;

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
      className="px-6 py-4 md:px-10 md:py-8 w-full max-w-[1112px] grid grid-cols-1 content-start gap-6"
    >
      {prompt && <Prompt {...prompt} onClose={() => set_prompt(undefined)} />}
      <h1 className="text-3xl font-bold">Public profile information</h1>
      <Fieldset disabled={general.busy} className="contents">
        <Group title="General">
          <Field
            {...general.register("tagline")}
            name="tagline"
            label="Tagline of your organization"
            required
            error={general.errors.tagline?.message}
          />
          <label htmlFor="npo-banner" className="label -mb-4">
            Banner image of your organization
          </label>
          <ImgEditor
            id="npo-banner"
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
          <label htmlFor="npo-card-img" className="label -mb-4">
            Marketplace Card image for your organization
          </label>
          <ImgEditor
            id="npo-card-img"
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

          <div>
            <p className="label">Profile URL</p>
            <Link to={profile_url} className="link break-all text-sm">
              {profile_url}
            </Link>
            <p className="mt-2">
              <Link
                to={href("/admin/:id/organization", { id: String(id) })}
                className="link inline-flex items-center gap-1 text-sm"
              >
                Manage
                <ChevronRightIcon className="icon-sm" aria-hidden />
                Organization
              </Link>
            </p>
          </div>
          {save_button(general, "Save general", isUploading)}
        </Group>
      </Fieldset>

      <Fieldset disabled={organization.busy} className="contents">
        <Group title="Organization">
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
      </Fieldset>

      <Fieldset disabled={social_media.busy} className="contents">
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
      </Fieldset>

      <div
        className={`flex flex-wrap justify-between items-center border rounded p-6 gap-4 ${
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
