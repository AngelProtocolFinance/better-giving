import { Editor, Element, Range, Transforms } from "slate";
import type { CustomElement, CustomText } from "./slate-types";

type MarkFormat = keyof Omit<CustomText, "text">;
type BlockType = CustomElement["type"];

const LIST_TYPES: readonly BlockType[] = [
  "numbered-list",
  "bulleted-list",
] as const;

export function is_mark_active(editor: Editor, format: MarkFormat): boolean {
  const marks = Editor.marks(editor);
  return marks ? !!marks[format] : false;
}

export function toggle_mark(editor: Editor, format: MarkFormat) {
  if (is_mark_active(editor, format)) {
    Editor.removeMark(editor, format);
  } else {
    Editor.addMark(editor, format, true);
  }
}

export function is_block_active(editor: Editor, type: BlockType): boolean {
  const [match] = Editor.nodes(editor, {
    match: (n) => Element.isElement(n) && n.type === type,
  });
  return !!match;
}

export function toggle_block(editor: Editor, type: BlockType) {
  const is_active = is_block_active(editor, type);
  const is_list = LIST_TYPES.includes(type);

  // unwrap any existing list wrapper
  Transforms.unwrapNodes(editor, {
    match: (n) => Element.isElement(n) && LIST_TYPES.includes(n.type),
    split: true,
  });

  const next_type: BlockType = is_active
    ? "paragraph"
    : is_list
      ? "list-item"
      : type;

  // set the block type
  Transforms.setNodes(editor, { type: next_type });

  // wrap in list container if activating a list
  if (!is_active && is_list) {
    Transforms.wrapNodes(editor, { type, children: [] });
  }
}

/** backspace at start of empty list-item → unwrap to paragraph */
export function handle_backspace_in_list(editor: Editor): boolean {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return false;

  const [match] = Editor.nodes(editor, {
    match: (n) => Element.isElement(n) && n.type === "list-item",
  });
  if (!match) return false;

  const [, path] = match;
  // only act when cursor is at the very start of the list-item
  if (Editor.isStart(editor, selection.anchor, path)) {
    Transforms.unwrapNodes(editor, {
      match: (n) => Element.isElement(n) && LIST_TYPES.includes(n.type),
      split: true,
    });
    Transforms.setNodes(editor, { type: "paragraph" });
    return true;
  }
  return false;
}
