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
  const [drag_active, set_drag_active] = useState(false);

  const handle_files = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);

    if (!props.specs.mimeTypes.includes(f.type as any)) {
      return props.onChange("invalid-type");
    }
    if (f.size > props.specs.mbLimit * 1e6) {
      return props.onChange("exceeds-size");
    }

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
    <div className={props.className} ref={ref}>
      {props.label}
      <p className="text-xs text-muted-fg mb-2">
        Valid types are:{" "}
        {props.specs.mimeTypes
          .map((m) => m.split("/")[1].toUpperCase())
          .join(", ")}
        . File should be less than {props.specs.mbLimit} MB{" "}
      </p>
      <label
        data-invalid={!!props.error}
        data-drag={drag_active}
        data-disabled={disabled}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) set_drag_active(true);
        }}
        onDragLeave={() => set_drag_active(false)}
        onDrop={(e) => {
          e.preventDefault();
          set_drag_active(false);
          if (disabled) return;
          const files = Array.from(e.dataTransfer.files);
          if (files.length) handle_files(files);
        }}
        className={`relative grid place-items-center rounded border border-dashed w-full h-45.5 cursor-pointer
          focus-within:outline-2 data-[drag="true"]:outline-2 outline-ring
          hover:bg-accent
          data-[disabled="true"]:bg-muted data-[disabled="true"]:pointer-events-none data-[disabled="true"]:outline-0
          data-[invalid="true"]:border-destructive
          `}
      >
        <input
          type="file"
          className="sr-only"
          accept={props.specs.mimeTypes.join(",")}
          disabled={disabled}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) handle_files(files);
            e.target.value = "";
          }}
        />
        <DropzoneText value={props.value || file} />
      </label>

      {props.error && (
        <span className="field-err mt-1 empty:hidden">{props.error}</span>
      )}
    </div>
  );
}
