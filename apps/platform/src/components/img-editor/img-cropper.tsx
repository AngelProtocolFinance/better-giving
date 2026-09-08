import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import type { AskProps } from "@better-giving/ui";
import { Save } from "lucide-react";
import { useMemo, useRef } from "react";
import { Cropper, type ICropperHandle } from "./cropper";

export interface IImgCropperProps {
  rounded?: boolean;
  input: File;
  aspect: [number, number];
}

/** asked, never mounted directly — `await ask<File>(ImgCropper, { input, aspect })`. */
export function ImgCropper({
  input,
  aspect,
  rounded,
  open,
  resolve,
  on_closed,
}: IImgCropperProps & AskProps<File>) {
  const [x, y] = aspect;
  const cropper_ref = useRef<ICropperHandle>(null);
  const src = useMemo(() => URL.createObjectURL(input), [input]);

  async function handle_save() {
    const blob = await cropper_ref.current?.get_cropped_blob();
    const cropped = blob
      ? new File([blob], input.name, { type: input.type })
      : input;
    return resolve(cropped);
  }

  // content area fills viewport constrained by aspect ratio
  const content_style = {
    width: `min(90vw, 80vh * ${x / y})`,
    aspectRatio: `${x} / ${y}`,
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        // dismissed — no file, and `ask` answers undefined
        if (!e.open) resolve();
      }}
      lazyMount
      unmountOnExit
      onExitComplete={on_closed}
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-overlay z-scrim" />
        <Dialog.Positioner className="contents">
          <Dialog.Content className="z-modal fixed-center border-2 rounded overflow-hidden">
            <div className="bg-panel flex items-center justify-end gap-2 p-1">
              <button
                type="button"
                aria-label="Save cropped image"
                className="glyph-btn hover:text-primary"
                onClick={handle_save}
              >
                <Save size={22} />
              </button>
            </div>
            <div style={content_style}>
              <Cropper
                src={src}
                aspect={aspect}
                rounded={rounded}
                ref={cropper_ref}
              />
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
