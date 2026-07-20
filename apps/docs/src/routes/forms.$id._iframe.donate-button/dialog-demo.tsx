import { Resizable } from "re-resizable";
import { useRef } from "react";
import {
  ColorPicker,
  RADIUS_PRESETS,
  RadiusIcon,
  type RadiusPreset,
} from "#/components/forms";

const MIN_WIDTH = 80;
const MAX_WIDTH = 300;
const MIN_HEIGHT = 32;
const MAX_HEIGHT = 80;

interface DialogConfig {
  button_bg: string;
  button_radius: RadiusPreset;
  button_width: number;
  button_height: number;
}

interface DialogDemoProps {
  id: string;
  config: DialogConfig;
  on_config_change: (config: DialogConfig) => void;
}

export function DialogDemo({ id, config, on_config_change }: DialogDemoProps) {
  const dialog_ref = useRef<HTMLDialogElement>(null);

  return (
    <div className="space-y-3">
      {/* Row 1: Color Picker | Radius Slider with value */}
      <div className="flex items-center gap-6 text-sm text-neutral-600 border-b pb-4 border-neutral-200">
        <div className="inline-flex items-center gap-2">
          <ColorPicker
            color={config.button_bg}
            on_change={(color) =>
              on_config_change({ ...config, button_bg: color })
            }
          />
          Button color
        </div>

        <div className="inline-flex items-center gap-2">
          <span>Border radius</span>
          <div className="inline-flex border border-neutral-200 rounded overflow-hidden">
            {(Object.keys(RADIUS_PRESETS) as RadiusPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() =>
                  on_config_change({ ...config, button_radius: preset })
                }
                className={`p-1.5 transition-colors ${
                  config.button_radius === preset
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50"
                }`}
                title={preset}
              >
                <RadiusIcon preset={preset} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Resizable Button */}
      <Resizable
        size={{ width: config.button_width, height: config.button_height }}
        minWidth={MIN_WIDTH}
        maxWidth={MAX_WIDTH}
        minHeight={MIN_HEIGHT}
        maxHeight={MAX_HEIGHT}
        onResizeStop={(_e, _direction, _ref, d) => {
          on_config_change({
            ...config,
            button_width: config.button_width + d.width,
            button_height: config.button_height + d.height,
          });
        }}
        enable={{
          top: false,
          right: false,
          bottom: false,
          left: false,
          topRight: false,
          bottomRight: true,
          bottomLeft: false,
          topLeft: false,
        }}
        handleComponent={{
          bottomRight: (
            <div className="w-3 h-3 bg-neutral-400 rounded absolute -bottom-1 -right-1 opacity-50 hover:opacity-100 transition-opacity cursor-nwse-resize" />
          ),
        }}
      >
        <button
          type="button"
          className="w-full h-full text-white font-medium hover:opacity-90 transition-opacity"
          style={{
            backgroundColor: config.button_bg,
            borderRadius: RADIUS_PRESETS[config.button_radius],
          }}
          onClick={() => dialog_ref.current?.showModal()}
        >
          Donate
        </button>
      </Resizable>

      {/* Row 3: Size indicator */}
      <p className="text-sm text-neutral-500">
        {config.button_width} × {config.button_height}
      </p>

      {/* Simple Dialog */}
      <dialog
        ref={dialog_ref}
        className="p-0 rounded backdrop:bg-black/50"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <form method="dialog" className="flex justify-end">
          <button
            type="submit"
            className="text-2xl absolute right-2 top-0 z-10 hover:opacity-70"
          >
            &times;
          </button>
        </form>
        <iframe
          title="donation form embed"
          src={`https://better.giving/forms/${id}`}
          allow="payment"
          width="100%"
          height="500"
          style={{
            maxWidth: "700px",
            width: "90vw",
          }}
        />
      </dialog>
    </div>
  );
}

export type { DialogConfig };
export { MAX_HEIGHT, MAX_WIDTH, MIN_HEIGHT, MIN_WIDTH };
