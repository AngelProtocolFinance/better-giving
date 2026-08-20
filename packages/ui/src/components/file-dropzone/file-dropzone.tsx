import { FileUpload } from "@ark-ui/react/file-upload";
import type { ReactNode, Ref } from "react";
import { useId, useImperativeHandle, useRef, useState } from "react";
import { DropzoneText } from "./dropzone-text";
import type { FileOutput, FileSpec } from "./types";

interface Props {
  label?: ReactNode;
  /** accessible name of the drop area, derived from the visible label at the
   * call site. required: zag's generic "dropzone" only reads unambiguously
   * when the form holds a single one. */
  dropzone_name: string;
  value: FileOutput;
  onChange: (val: FileOutput) => void;
  disabled?: boolean;
  className?: string;
  specs: FileSpec;
  error?: string;
  /** hands the accepted file to the app's upload endpoint and resolves to the
   * stored url. injected: the endpoint is the app's, not the design system's. */
  upload: (file: File) => Promise<string>;
  /** where a failed upload goes (sentry, a logger). required: `onChange("failure")`
   * is the user-visible outcome, so without this a failed upload is silent to
   * everyone but the donor in front of it. */
  report_error: (err: unknown) => void;
}
/** what a form library gets to focus. the drop area is the control — it is
 * `role="button"`, named, and paints the ring; the hidden input is
 * `aria-hidden` by zag's own design and announces nothing. */
type El = Pick<HTMLElement, "focus">;

export function FileDropzone({ ref, ...props }: Props & { ref?: Ref<El> }) {
  const [file, setFile] = useState<File>();
  const root_ref = useRef<HTMLDivElement>(null);
  const dropzone_ref = useRef<HTMLDivElement>(null);
  const error_id = useId();

  useImperativeHandle(
    ref,
    () => ({
      // the root scrolls, not the drop area: scroll-mt-24 lives there and clears
      // the sticky header, and it carries the label the drop area is named for
      focus: () => {
        dropzone_ref.current?.focus({ preventScroll: true });
        // "start", not "nearest": nearest no-ops when the field is already
        // partly in view, which is the case scroll-mt-24 exists to correct
        root_ref.current?.scrollIntoView({ block: "start" });
      },
    }),
    []
  );

  const handle_accept = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    try {
      props.onChange("loading");
      const url = await props.upload(f);
      return props.onChange(url);
    } catch (err) {
      props.report_error(err);
      return props.onChange("failure");
    }
  };

  const disabled = props.disabled || props.value === "loading";

  return (
    <FileUpload.Root
      ref={root_ref}
      className={`${props.className ?? ""} scroll-mt-24`}
      translations={{ dropzone: props.dropzone_name }}
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
        ref={dropzone_ref}
        // describedby, not invalid/errormessage: neither is global in ARIA 1.2
        // and role="button" supports neither, so both were inert here. the
        // destructive border comes from zag's data-invalid off `invalid` above.
        aria-describedby={props.error ? error_id : undefined}
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

      <span id={error_id} className="field-err mt-1 empty:hidden">
        {props.error}
      </span>
    </FileUpload.Root>
  );
}
