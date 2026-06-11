import { useImperativeHandle } from "react";
import { use_cropper } from "./use-cropper";

export interface ICropperHandle {
  get_cropped_blob(): Promise<Blob | null>;
}

interface ICropperProps {
  src: string;
  aspect: [number, number];
  rounded?: boolean;
  ref?: React.Ref<ICropperHandle>;
}

const BRACKET_SIZE = 20;

// [key, x-multiplier, y-multiplier, border classes]
const CORNER_BRACKETS: [string, number, number, string][] = [
  ["nw", 0, 0, "border-t-[3px] border-l-[3px]"],
  ["ne", 1, 0, "border-t-[3px] border-r-[3px]"],
  ["sw", 0, 1, "border-b-[3px] border-l-[3px]"],
  ["se", 1, 1, "border-b-[3px] border-r-[3px]"],
];

export function Cropper({ src, aspect, rounded, ref }: ICropperProps) {
  const {
    container_ref,
    img_ref,
    crop,
    on_image_load,
    on_pointer_down,
    on_pointer_move,
    on_pointer_up,
    get_cropped_blob,
    ready,
  } = use_cropper({ aspect });

  useImperativeHandle(ref, () => ({ get_cropped_blob }), [get_cropped_blob]);

  return (
    <div
      ref={container_ref}
      className="relative overflow-hidden w-full h-full bg-gray-900 touch-none select-none"
      onPointerDown={on_pointer_down}
      onPointerMove={on_pointer_move}
      onPointerUp={on_pointer_up}
      onPointerCancel={on_pointer_up}
    >
      <img
        ref={img_ref}
        src={src}
        onLoad={on_image_load}
        className="absolute max-w-none pointer-events-none"
        draggable={false}
        alt=""
      />
      {ready && (
        <>
          {/* dark overlay with transparent crop hole */}
          <div
            className={`absolute pointer-events-none border border-white/40 ${rounded ? "rounded-full" : ""}`}
            style={{
              left: crop.x,
              top: crop.y,
              width: crop.w,
              height: crop.h,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
            }}
          >
            {/* rule-of-thirds grid */}
            <div className="absolute left-1/3 inset-y-0 w-px bg-white/15" />
            <div className="absolute left-2/3 inset-y-0 w-px bg-white/15" />
            <div className="absolute top-1/3 inset-x-0 h-px bg-white/15" />
            <div className="absolute top-2/3 inset-x-0 h-px bg-white/15" />
          </div>

          {/* L-shaped corner brackets */}
          {CORNER_BRACKETS.map(([key, fx, fy, border]) => (
            <div
              key={key}
              className={`absolute border-white pointer-events-none ${border}`}
              style={{
                left:
                  crop.x + crop.w * fx - (fx === 0 ? 1 : -(1 - BRACKET_SIZE)),
                top:
                  crop.y + crop.h * fy - (fy === 0 ? 1 : -(1 - BRACKET_SIZE)),
                width: BRACKET_SIZE,
                height: BRACKET_SIZE,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}
