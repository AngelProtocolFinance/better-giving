import { FileDropzone, Label } from "@better-giving/ui";

const id_spec = {
  mbLimit: 6,
  mimeTypes: ["image/jpeg", "image/png", "application/pdf"],
} as const;

const statement_spec = { mbLimit: 6, mimeTypes: ["application/pdf"] } as const;

export const Empty = () => (
  <FileDropzone
    label={
      <Label required className="mb-2">
        Please provide passport, driver's license, or ID card.
      </Label>
    }
    value=""
    onChange={() => {}}
    specs={id_spec}
  />
);

export const Uploaded = () => (
  <FileDropzone
    label={
      <Label required className="mb-2">
        Proof of registration as a 501(c)(3) nonprofit or equivalent
      </Label>
    }
    value="https://cdn.better.giving/registrations/rainforest-trust-501c3.pdf"
    onChange={() => {}}
    specs={id_spec}
  />
);

export const Loading = () => (
  <FileDropzone
    label={
      <Label className="mb-2">Bank statement for the payout account</Label>
    }
    value="loading"
    onChange={() => {}}
    specs={statement_spec}
  />
);

export const WithError = () => (
  <FileDropzone
    label={
      <Label required className="mb-2">
        Please provide passport, driver's license, or ID card.
      </Label>
    }
    value=""
    onChange={() => {}}
    specs={id_spec}
    error="Exceeds size limit"
  />
);

export const Disabled = () => (
  <FileDropzone
    label={
      <Label className="mb-2">Bank statement for the payout account</Label>
    }
    value=""
    onChange={() => {}}
    specs={statement_spec}
    disabled
  />
);
