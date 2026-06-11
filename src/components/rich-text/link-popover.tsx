import { LinkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Editor, Transforms } from "slate";
import { ReactEditor, useSlate } from "slate-react";
import { is_mark_active } from "./editor-utils";
import "./slate-types";

export function LinkButton() {
  const editor = useSlate();
  const [open, set_open] = useState(false);
  const [url, set_url] = useState("");
  const saved_selection = useRef(editor.selection);
  const active = is_mark_active(editor, "link");
  const panel_ref = useRef<HTMLDivElement>(null);

  function toggle() {
    if (open) {
      set_open(false);
    } else {
      saved_selection.current = editor.selection;
      const marks = Editor.marks(editor);
      set_url((marks?.link as string) ?? "");
      set_open(true);
    }
  }

  /** restore editor focus + selection before mutating */
  function restore_selection() {
    if (saved_selection.current) {
      ReactEditor.focus(editor);
      Transforms.select(editor, saved_selection.current);
    }
  }

  function apply() {
    restore_selection();
    set_open(false);
    if (url.trim()) {
      Editor.addMark(editor, "link", url.trim());
    }
  }

  function remove() {
    restore_selection();
    set_open(false);
    Editor.removeMark(editor, "link");
  }

  // close on outside click
  useEffect(() => {
    if (!open) return;
    function on_click(e: MouseEvent) {
      if (panel_ref.current && !panel_ref.current.contains(e.target as Node)) {
        set_open(false);
      }
    }
    document.addEventListener("mousedown", on_click);
    return () => document.removeEventListener("mousedown", on_click);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        className={`p-1.5 rounded cursor-pointer ${active ? "text-primary" : "text-muted-fg hover:text-fg"}`}
        onPointerDown={(e) => e.preventDefault()}
        onClick={toggle}
      >
        <LinkIcon size={16} />
      </button>
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: event containment only
        <div
          ref={panel_ref}
          role="presentation"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-full left-0 z-50 mt-1 rounded border bg-popover text-popover-fg p-3 shadow-md w-72"
        >
          <div className="flex flex-col gap-2">
            <input
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => set_url(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              className="w-full border rounded px-2 py-1 text-sm bg-transparent outline-ring"
            />
            <div className="flex gap-2 justify-end">
              {active && (
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={remove}
                  className="text-xs text-destructive underline"
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={apply}
                className="text-xs bg-primary text-primary-fg px-3 py-1 rounded"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
