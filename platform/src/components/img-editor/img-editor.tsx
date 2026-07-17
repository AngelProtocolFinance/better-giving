import { ArrowUpFromLine, Crop, Undo } from "lucide-react";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { unpack } from "#/helpers/unpack";
import { uploadFile } from "#/helpers/upload-file";
import { report_error } from "@/errors/report";
import { humanize } from "@/helpers/decimal";
import { AspectTooltip } from "./aspect-tooltip";
import { ImgCropper } from "./img-cropper";
import type { ControlledProps } from "./types";

const BYTES_IN_MB = 1e6;

export function ImgEditor({
  ref,
  ...props
}: ControlledProps & { ref?: React.Ref<HTMLInputElement> }) {
  const [file, setFile] = useState<File>();
  const [open_cropper, set_open_cropper] = useState(false);
  const [drag_active, set_drag_active] = useState(false);
  const input_ref = useRef<HTMLInputElement>(null);

  const preview = useMemo(
    () =>
      file
        ? props.spec.type.includes(file.type as any)
          ? URL.createObjectURL(file)
          : ""
        : props.value && !["invalid-type", "exceeds-size"].includes(props.value)
          ? props.value
          : "",
    [file, props.spec.type, props.value]
  );

  const handle_files = (files: File[]) => {
    const newFile = files[0];
    const size = newFile.size;
    if (!newFile) return;

    if (!props.spec.type.includes(newFile.type as any)) {
      //don't show cropper, render blank preview
      return props.on_change("invalid-type");
    }

    if (props.spec.max_size && size > props.spec.max_size) {
      return props.on_change("exceeds-size");
    }

    setFile(newFile);
    set_open_cropper(true);
  };

  const styles = unpack(props.classes);
  const is_loading = props.value === "loading";
  const disabled = props.disabled || is_loading;
  const overlay = `before:content-[''] before:grid before:place-items-center before:absolute before:inset-0 data-[drag="true"]:before:bg-accent data-[loading="true"]:before:bg-accent/90 data-[loading="true"]:before:content-['._._.'] before:text-xl before:font-bold `;

  async function handleSave(cropped: File) {
    setFile(cropped);
    set_open_cropper(false);
    if (props.spec.max_size && cropped.size > props.spec.max_size) {
      return props.on_change("exceeds-size");
    }

    try {
      props.on_change("loading");
      const url = await uploadFile(cropped);
      return props.on_change(url);
    } catch (err) {
      report_error(err);
      props.on_change("failure");
    }
  }

  const file_input = (
    <input
      ref={(node) => {
        input_ref.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref)
          (ref as React.MutableRefObject<HTMLInputElement | null>).current =
            node;
      }}
      type="file"
      className="sr-only"
      accept={props.spec.type.join(",")}
      disabled={disabled}
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length) handle_files(files);
        e.target.value = "";
      }}
    />
  );

  return (
    <div className={`${styles.container} grid grid-rows-[1fr_auto]`}>
      <p className="text-xs text-muted-fg mb-2">
        <span>
          Valid types are:{" "}
          {props.spec.type
            .map((m) => m.split("/")[1].toUpperCase().replace(/\+xml/gi, ""))
            .join(", ")}
          .{" "}
          {props.spec.max_size ? (
            <>
              Image should be less than {props.spec.max_size / BYTES_IN_MB}MB in
              size.
              <br />
              {file?.size
                ? `Current image size: ${humanize(file.size / BYTES_IN_MB)}MB.`
                : ""}
            </>
          ) : (
            ""
          )}
        </span>{" "}
        <AspectTooltip aspect={props.spec.aspect} />
      </p>
      {file && (
        <ImgCropper
          rounded={props.spec.rounded}
          is_open={open_cropper}
          input={file}
          aspect={props.spec.aspect}
          onSave={handleSave}
          onClose={() => {
            setFile(undefined);
            set_open_cropper(false);
          }}
        />
      )}
      {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps file input */}
      <label
        data-loading={is_loading}
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
        className={`relative ${overlay} ${styles.dropzone} group rounded border border-dashed bg-input cursor-pointer
          focus-within:outline-2 data-[drag="true"]:outline-2 outline-ring
          hover:bg-accent
          data-[disabled="true"]:bg-muted data-[disabled="true"]:pointer-events-none
          data-[invalid="true"]:border-destructive
          `}
        style={{
          background: preview
            ? `url('${preview}') center/cover no-repeat`
            : undefined,
        }}
      >
        {!preview ? (
          <div
            className="absolute-center relative grid justify-items-center text-sm text-muted-fg select-none"
            tabIndex={-1}
          >
            {file_input}
            <ArrowUpFromLine size={22} className="mb-4.5" />
            <p className="font-semibold mb-1">Upload file</p>
            <span className="text-center">
              Click to Browse or Drag &amp; Drop
            </span>
          </div>
        ) : (
          /** something is uploaded and would disrupt text above
           *  so just show upload icon instead of it.
           */
          <div className="absolute-center hidden group-hover:flex">
            <div className={buttonStyle}>
              {file_input}
              <ArrowUpFromLine size={15} />
            </div>
            {
              /** only show controls if new file is uploaded */
              (file || props.value === "invalid-type") && !is_loading && (
                <IconButton
                  disabled={props.disabled}
                  onClick={(e) => {
                    setFile(undefined);
                    props.on_undo(e);
                  }}
                >
                  <Undo size={18} />
                </IconButton>
              )
            }
            {file && !props.error && (
              <IconButton
                onClick={(e) => {
                  e.stopPropagation();
                  set_open_cropper(true);
                }}
                disabled={props.disabled}
              >
                <Crop size={16} />
              </IconButton>
            )}
          </div>
        )}
      </label>

      <span className="empty:hidden text-destructive text-xs mt-1">
        {props.error}
      </span>
    </div>
  );
}

const buttonStyle =
  "text-primary-fg text-lg bg-primary hover:bg-primary/80 disabled:bg-border disabled:text-muted-fg p-2 m-1 rounded shadow-lg";
function IconButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} type="button" className={buttonStyle} />;
}
