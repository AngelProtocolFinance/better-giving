import { BoldIcon, ItalicIcon, ListIcon, ListOrderedIcon } from "lucide-react";
import { type Ref, useCallback, useImperativeHandle, useMemo } from "react";
import type { Descendant } from "slate";
import { createEditor, Editor } from "slate";
import { withHistory } from "slate-history";
import {
  Editable,
  ReactEditor,
  type RenderElementProps,
  type RenderLeafProps,
  Slate,
  useSlate,
  withReact,
} from "slate-react";
import {
  handle_backspace_in_list,
  is_block_active,
  is_mark_active,
  toggle_block,
  toggle_mark,
} from "./editor-utils";
import { to_document } from "./helpers";
import { LinkButton } from "./link-popover";
import type { CustomElement, CustomText } from "./slate-types";
import "./slate-types";
import type { Editable as EditableProps, Props } from "./types";

type MarkFormat = keyof Omit<CustomText, "text">;
type BlockType = CustomElement["type"];

type El = Pick<HTMLDivElement, "focus">;

function SlateEditor({ ref, ...props }: Props & { ref?: Ref<El> }) {
  const editor = useMemo(() => withHistory(withReact(createEditor())), []);

  const content_value = props.content.value;
  const initial = useMemo(() => to_document(content_value), [content_value]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      try {
        ReactEditor.focus(editor);
      } catch {}
    },
  }));

  const on_change = props.readOnly ? undefined : props.onChange;
  const handle_change = useCallback(
    (value: Descendant[]) => {
      if (!on_change) return;
      const text = editor.children
        .map((_, i) => Editor.string(editor, [i]))
        .join("\n");
      const length = text.length;

      on_change({
        value: length <= 0 ? "" : JSON.stringify(value),
        length,
      });
    },
    [editor, on_change]
  );

  const render_element = useCallback(
    (p: RenderElementProps) => <RenderElement {...p} />,
    []
  );
  const render_leaf = useCallback(
    (p: RenderLeafProps) => <RenderLeaf {...p} />,
    []
  );

  const focus_editor = useCallback(() => {
    try {
      ReactEditor.focus(editor);
    } catch {}
  }, [editor]);

  return (
    <Slate editor={editor} initialValue={initial} onChange={handle_change}>
      {/* single wrapper: fills grid 1fr row, click-to-focus on empty space */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click-to-focus wrapper */}
      <div
        style={{ fontFamily: "inherit", fontSize: "inherit" }}
        className="row-span-full w-full flex flex-col cursor-text"
        role="presentation"
        onClick={props.readOnly ? undefined : focus_editor}
      >
        {!props.readOnly && <Toolbar />}
        <Editable
          readOnly={props.readOnly}
          placeholder={
            props.readOnly ? undefined : (props as EditableProps).placeHolder
          }
          renderElement={render_element}
          renderLeaf={render_leaf}
          className="outline-none mt-2 flex-1"
          onKeyDown={(event) => {
            if (event.key === "Backspace" && handle_backspace_in_list(editor)) {
              event.preventDefault();
              return;
            }
            if (!event.ctrlKey && !event.metaKey) return;
            switch (event.key) {
              case "b":
                event.preventDefault();
                toggle_mark(editor, "bold");
                break;
              case "i":
                event.preventDefault();
                toggle_mark(editor, "italic");
                break;
            }
          }}
        />
      </div>
    </Slate>
  );
}

export default SlateEditor;

function Toolbar() {
  return (
    <div className="flex items-center gap-0.5 pb-2 border-b border-muted">
      <MarkButton format="bold" icon={<BoldIcon size={16} />} />
      <MarkButton format="italic" icon={<ItalicIcon size={16} />} />
      <BlockButton type="numbered-list" icon={<ListOrderedIcon size={16} />} />
      <BlockButton type="bulleted-list" icon={<ListIcon size={16} />} />
      <LinkButton />
    </div>
  );
}

interface IMarkButton {
  format: MarkFormat;
  icon: React.ReactNode;
}

function MarkButton({ format, icon }: IMarkButton) {
  const editor = useSlate();
  const active = is_mark_active(editor, format);
  return (
    <button
      type="button"
      className={`p-1.5 rounded cursor-pointer ${active ? "text-primary" : "text-muted-fg hover:text-fg"}`}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => toggle_mark(editor, format)}
    >
      {icon}
    </button>
  );
}

interface IBlockButton {
  type: BlockType;
  icon: React.ReactNode;
}

function BlockButton({ type, icon }: IBlockButton) {
  const editor = useSlate();
  const active = is_block_active(editor, type);
  return (
    <button
      type="button"
      className={`p-1.5 rounded cursor-pointer ${active ? "text-primary" : "text-muted-fg hover:text-fg"}`}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => toggle_block(editor, type)}
    >
      {icon}
    </button>
  );
}

function RenderElement({ attributes, children, element }: RenderElementProps) {
  switch (element.type) {
    case "numbered-list":
      return (
        <ol {...attributes} className="list-decimal pl-6">
          {children}
        </ol>
      );
    case "bulleted-list":
      return (
        <ul {...attributes} className="list-disc pl-6">
          {children}
        </ul>
      );
    case "list-item":
      return <li {...attributes}>{children}</li>;
    default:
      return <p {...attributes}>{children}</p>;
  }
}

function RenderLeaf({ attributes, children, leaf }: RenderLeafProps) {
  if (leaf.bold) {
    children = <strong>{children}</strong>;
  }
  if (leaf.italic) {
    children = <em>{children}</em>;
  }
  if (leaf.link) {
    children = (
      <a
        href={leaf.link}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline"
      >
        {children}
      </a>
    );
  }
  return <span {...attributes}>{children}</span>;
}
