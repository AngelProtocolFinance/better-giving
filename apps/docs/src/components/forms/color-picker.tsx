import { useState } from "react";
import { HexColorPicker } from "react-colorful";

interface ColorPickerProps {
  color: string;
  on_change: (color: string) => void;
}

export function ColorPicker({ color, on_change }: ColorPickerProps) {
  const [is_open, set_is_open] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => set_is_open(!is_open)}
        className="w-6 h-6 rounded cursor-pointer border border-neutral-300"
        style={{ backgroundColor: color }}
        aria-label="Select color"
      />
      {is_open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => set_is_open(false)}
            aria-label="Close color picker"
          />
          <div className="absolute top-full left-0 mt-2 z-20 bg-white p-3 rounded border border-neutral-200">
            <HexColorPicker color={color} onChange={on_change} />
            <input
              type="text"
              value={color}
              onChange={(e) => on_change(e.target.value)}
              className="mt-2 w-full px-2 py-1 text-sm border border-neutral-200 rounded"
              spellCheck={false}
            />
          </div>
        </>
      )}
    </div>
  );
}
