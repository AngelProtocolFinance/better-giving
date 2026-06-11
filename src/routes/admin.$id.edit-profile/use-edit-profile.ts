import { useState } from "react";
import type { FieldNamesMarkedBoolean, SubmitHandler } from "react-hook-form";
import { useFetcher } from "react-router";
import type { IPrompt } from "#/components/prompt";
import { to_text } from "#/components/rich-text";
import { error_prompt } from "#/helpers/error-prompt";
import type { EndowmentProfileUpdate } from "#/types/npo";
import type { FV } from "./schema";

type DirtyFields = FieldNamesMarkedBoolean<FV>;

export function use_edit_npo(df: DirtyFields, npo_id: number) {
  const fetcher = useFetcher();
  const [prompt, set_prompt] = useState<IPrompt>();

  const onSubmit: SubmitHandler<FV> = async (fv) => {
    try {
      const update: Partial<EndowmentProfileUpdate> = {};

      if (df.logo) update.logo = fv.logo;
      if (df.image) update.image = fv.image;
      if (df.card_img) update.card_img = fv.card_img;

      if (df.slug) {
        if (fv.slug !== "") {
          const npo = await fetch(`/api/npos/${fv.slug}?fields=id`).then((r) =>
            r.status === 404 ? undefined : r.json()
          );

          if (npo?.id && npo.id !== npo_id) {
            return set_prompt({
              type: "error",
              children: `Slug "${fv.slug}" is already taken`,
            });
          }
        }
        update.slug = fv.slug;
      }

      if (df.name) update.name = fv.name;
      if (df.tagline) update.tagline = fv.tagline;
      if (df.registration_number) {
        update.registration_number = fv.registration_number;
      }

      if (df.overview) {
        update.overview_rich = fv.overview.value;
        update.overview_v2 = to_text(fv.overview.value);
      }
      if (df.url) update.url = fv.url;

      if (df.endow_designation) update.endow_designation = fv.endow_designation;

      if (df.hq_country) update.hq_country = fv.hq_country;
      if (df.active_in_countries) {
        update.active_in_countries = fv.active_in_countries;
      }

      if (df.street_address) update.street_address = fv.street_address;

      if (df.social_media_urls) update.social_media_urls = fv.social_media_urls;
      if (df.published) update.published = fv.published;

      fetcher.submit(update, {
        method: "PATCH",
        action: ".",
        encType: "application/json",
      });
    } catch (err) {
      set_prompt(error_prompt(err, { context: "applying profile changes" }));
    }
  };

  return {
    onSubmit,
    state: fetcher.state,
    prompt,
    set_prompt,
  };
}
