import { FileUpload } from "@ark-ui/react/file-upload";
import type { ReactNode, Ref } from "react";
import { useState } from "react";
import { uploadFile } from "#/helpers/upload-file";
import { report_error } from "@/errors/report";
import { DropzoneText } from "./dropzone-text";
import type { FileOutput, FileSpec } from "./types";

interface Props {
  label?: ReactNode;
  value: FileOutput;
  onChange: (val: FileOutput) => void;
  disabled?: boolean;
  className?: string;
  specs: FileSpec;
  error?: string;
}
type El = HTMLDivElement;

export function FileDropzone({ ref, ...props }: Props & { ref?: Ref<El> }) {
  const [file, setFile] = useState<File>();

  const handle_accept = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    try {
      props.onChange("loading");
      const url = await uploadFile(f);
      return props.onChange(url);
    } catch (err) {
      report_error(err);
      return props.onChange("failure");
    }
  };

  const disabled = props.disabled || props.value === "loading";

  return (
    <FileUpload.Root
      ref={ref}
      tabIndex={-1}
      className={`${props.className ?? ""} scroll-mt-24 outline-none`}
      accept={props.specs.mimeTypes}
      maxFileSize={props.specs.mbLimit * 1e6}
      maxFiles={1}
      disabled={disabled}
      invalid={!!props.error}
      onFileAccept={(d) => handle_accept(d.files)}
      onFileReject={(d) => {
        const f = d.files[0];
        if (f) setFile(f.file);
        const codes = f?.errors ?? [];
        if (codes.includes("FILE_INVALID_TYPE")) {
          return props.onChange("invalid-type");
        }
        if (codes.includes("FILE_TOO_LARGE")) {
          return props.onChange("exceeds-size");
        }
      }}
    >
      {props.label}
      <p className="text-xs text-muted-fg mb-2">
        Valid types are:{" "}
        {props.specs.mimeTypes
          .map((m) => m.split("/")[1].toUpperCase())
          .join(", ")}
        . File should be less than {props.specs.mbLimit} MB{" "}
      </p>
      <FileUpload.Dropzone
        className={`relative grid place-items-center rounded border border-dashed w-full h-45.5 cursor-pointer
          focus-within:outline-2 data-dragging:outline-2 outline-ring
          hover:bg-accent
          data-disabled:bg-muted data-disabled:pointer-events-none data-disabled:outline-0
          data-invalid:border-destructive
          `}
      >
        <FileUpload.HiddenInput />
        <DropzoneText value={props.value || file} />
      </FileUpload.Dropzone>

      {props.error && (
        <span className="field-err mt-1 empty:hidden">{props.error}</span>
      )}
    </FileUpload.Root>
  );
}
