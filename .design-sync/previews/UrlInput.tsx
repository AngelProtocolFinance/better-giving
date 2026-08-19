import { UrlInput } from "platform";

export const Basic = () => (
  <UrlInput
    name="url"
    label="Website of your organization"
    placeholder="rainforesttrust.org"
  />
);

export const Filled = () => (
  <UrlInput
    name="url"
    label="Website of your organization"
    required
    defaultValue="oceanconservancy.org"
  />
);

export const WithError = () => (
  <UrlInput
    name="facebook"
    label="Facebook"
    required
    defaultValue="facebook..com/booksforkids"
    error="Enter a valid URL"
  />
);

export const Disabled = () => (
  <UrlInput
    name="url_locked"
    label="Website of your organization"
    disabled
    defaultValue="rainforesttrust.org"
  />
);

export const SocialLinks = () => (
  <div className="flex flex-col gap-4">
    <UrlInput
      name="linkedin"
      label="LinkedIn"
      placeholder="linkedin.com/"
      defaultValue="linkedin.com/company/ocean-conservancy"
    />
    <UrlInput
      name="instagram"
      label="Instagram"
      required={false}
      placeholder="instagram.com/"
    />
  </div>
);
