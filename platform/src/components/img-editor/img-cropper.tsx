import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { Save } from "lucide-react";
import { useMemo, useRef } from "react";
import { Cropper, type ICropperHandle } from "./cropper";

interface IImgCropperProps {
  rounded?: boolean;
  is_open: boolean;
  onClose(): void;
  input: File;
  aspect: [number, number];
  onSave(cropped: File): void;
}

export function ImgCropper({
  input,
  aspect,
  onSave,
  is_open,
  onClose,
  rounded,
}: IImgCropperProps) {
  const [x, y] = aspect;
  const cropper_ref = useRef<ICropperHandle>(null);
  const src = useMemo(() => URL.createObjectURL(input), [input]);

  async function handle_save() {
    const blob = await cropper_ref.current?.get_cropped_blob();
    const cropped = blob
      ? new File([blob], input.name, { type: input.type })
      : input;
    return onSave(cropped);
  }

  // content area fills viewport constrained by aspect ratio
  const content_style = {
    width: `min(90vw, 80vh * ${x / y})`,
    aspectRatio: `${x} / ${y}`,
  };

  return (
    <Dialog.Root
      open={is_open}
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-fg/30 z-50" />
        <Dialog.Positioner className="contents">
          <Dialog.Content className="z-50 fixed-center border-2 rounded overflow-hidden">
            <div className="bg-card flex items-center justify-end gap-2 p-1">
              <button
                type="button"
                className="hover:text-primary"
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
