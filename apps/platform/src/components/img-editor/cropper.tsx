import { ImageCropper, useImageCropper } from "@ark-ui/react/image-cropper";
import { useImperativeHandle } from "react";

export interface ICropperHandle {
  get_cropped_blob(): Promise<Blob | null>;
}

interface ICropperProps {
  src: string;
  aspect: [number, number];
  rounded?: boolean;
  ref?: React.Ref<ICropperHandle>;
}

const OUTPUT_SIZES: Record<string, [number, number]> = {
  "1/1": [315, 315],
  "2/1": [792, 396],
  "4/1": [1584, 396],
};

function get_output_size(aspect: [number, number]): [number, number] {
  return (
    OUTPUT_SIZES[`${aspect[0]}/${aspect[1]}`] ?? [
      aspect[0] * 396,
      aspect[1] * 396,
    ]
  );
}

export function Cropper({ src, aspect, rounded, ref }: ICropperProps) {
  const [ax, ay] = aspect;
  const cropper = useImageCropper({
    aspectRatio: ax / ay,
    cropShape: rounded ? "circle" : "rectangle",
  });

  useImperativeHandle(
    ref,
    () => ({
      async get_cropped_blob() {
        const blob = await cropper.getCroppedImage({ output: "blob" });
        if (!(blob instanceof Blob)) return null;
        // canonical output size (resize via canvas to match prior contract)
        const [out_w, out_h] = get_output_size(aspect);
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = out_w;
        canvas.height = out_h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0, out_w, out_h);
        return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
      },
    }),
    [cropper, aspect]
  );

  return (
    <ImageCropper.RootProvider
      value={cropper}
      className="relative w-full h-full bg-black overflow-hidden touch-none select-none"
    >
      <ImageCropper.Viewport className="relative w-full h-full">
        <ImageCropper.Image
          src={src}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        />
        {/* the focus ring is the system's standard 2px --ring at offset 2, but
            here it is drawn over the donor's own photograph behind the scrim,
            so its contrast against the backdrop is whatever they uploaded and
            can fall under the 3:1 WCAG 1.4.11 asks of a non-text indicator.
            the selection edge goes fully opaque white on focus to pair a
            light boundary with the dark-ish blue one: against pale imagery the
            blue reads, against dark imagery the white does. no new token —
            one focus color is all the closed palette has, and inventing a
            second is a design decision, not a fix. */}
        <ImageCropper.Selection
          className="box-content border border-white/40 focus-visible:border-white focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 cursor-move data-[shape=circle]:rounded-full data-dragging:cursor-grabbing"
          style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }}
        >
          {/* rule-of-thirds grid */}
          <ImageCropper.Grid
            axis="horizontal"
            className="absolute pointer-events-none inset-x-0 inset-y-1/3 border-y border-white/15"
          />
          <ImageCropper.Grid
            axis="vertical"
            className="absolute pointer-events-none inset-y-0 inset-x-1/3 border-x border-white/15"
          />
          {/* corners: L-brackets; edges: small white dots */}
          {ImageCropper.handles.map((position) => (
            <ImageCropper.Handle
              key={position}
              position={position}
              className="absolute flex items-center justify-center touch-none size-5"
            >
              <div
                className={
                  CORNER_BORDER[position] ??
                  "size-2 rounded-full bg-white shadow-handle"
                }
              />
            </ImageCropper.Handle>
          ))}
        </ImageCropper.Selection>
      </ImageCropper.Viewport>
    </ImageCropper.RootProvider>
  );
}

const CORNER_BORDER: Record<string, string> = {
  "top-left": "size-full border-t-[3px] border-l-[3px] border-white",
  "top-right": "size-full border-t-[3px] border-r-[3px] border-white",
  "bottom-left": "size-full border-b-[3px] border-l-[3px] border-white",
  "bottom-right": "size-full border-b-[3px] border-r-[3px] border-white",
};
