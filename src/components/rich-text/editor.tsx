import {
  EditorProvider,
  type PortableTextBlock,
  PortableTextEditable,
  type RenderDecoratorFunction,
  type RenderListItemFunction,
  type RenderStyleFunction,
  useEditor,
  useEditorSelector,
} from "@portabletext/editor";
import { EventListenerPlugin } from "@portabletext/editor/plugins";
import * as selectors from "@portabletext/editor/selectors";
import { toPlainText } from "@portabletext/toolkit";
import {
  BoldIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
} from "lucide-react";
import { type Ref, useImperativeHandle, useState } from "react";
import { to_document } from "./helpers";
import { pt_schema } from "./schema";
import type { Editable as EditableProps, Props } from "./types";

type El = Pick<HTMLDivElement, "focus">;

function PtEditor({ ref, ...props }: Props & { ref?: Ref<El> }) {
  // readOnly is rendered upstream via PortableText; this module only mounts in edit mode.
  return (
    <EditableShell
      {...(props as EditableProps)}
      content={props.content}
      classes={props.classes}
      ref={ref}
    />
  );
}

function EditableShell({
  ref,
  ...props
}: EditableProps & {
  content: Props["content"];
  classes?: Props["classes"];
  ref?: Ref<El>;
}) {
  const [initial] = useState(() => to_document(props.content.value));
  return (
    <EditorProvider
      initialConfig={{ schemaDefinition: pt_schema, initialValue: initial }}
    >
      <EventListenerPlugin
        on={(event) => {
          if (event.type === "mutation") {
            const value =
              (event.value as PortableTextBlock[] | undefined) ?? [];
            const text = toPlainText(value);
            props.onChange({
              value: text.length <= 0 ? "" : JSON.stringify(value),
              length: text.length,
            });
          }
        }}
      />
      <FocusBridge fwdRef={ref} />
      <Toolbar />
      <PortableTextEditable
        className="outline-none mt-2 flex-1"
        placeholder={props.placeHolder}
        renderStyle={render_style}
        renderDecorator={render_decorator}
        renderBlock={(p) => <div>{p.children}</div>}
        renderListItem={render_list_item}
        renderAnnotation={(p) =>
          p.schemaType.name === "link" ? (
            <a
              href={(p.value as { href?: string } | undefined)?.href}
              className="text-primary underline"
            >
              {p.children}
            </a>
          ) : (
            p.children
          )
        }
      />
    </EditorProvider>
  );
}

function FocusBridge({ fwdRef }: { fwdRef?: Ref<El> }) {
  const editor = useEditor();
  useImperativeHandle(fwdRef, () => ({
    focus: () => editor.send({ type: "focus" }),
  }));
  return null;
}

const render_style: RenderStyleFunction = (p) => <>{p.children}</>;

const render_decorator: RenderDecoratorFunction = (p) => {
  if (p.value === "strong") return <strong>{p.children}</strong>;
  if (p.value === "em") return <em>{p.children}</em>;
  return <>{p.children}</>;
};

const render_list_item: RenderListItemFunction = (p) => {
  const cls = p.value === "number" ? "list-decimal pl-6" : "list-disc pl-6";
  return <li className={cls}>{p.children}</li>;
};

function Toolbar() {
  const editor = useEditor();
  return (
    <div className="flex items-center gap-0.5 pb-2 border-b border-muted">
      <DecoratorBtn name="strong" icon={<BoldIcon size={16} />} />
      <DecoratorBtn name="em" icon={<ItalicIcon size={16} />} />
      <ListBtn name="number" icon={<ListOrderedIcon size={16} />} />
      <ListBtn name="bullet" icon={<ListIcon size={16} />} />
      <button
        type="button"
        className="p-1.5 rounded cursor-pointer text-muted-fg hover:text-fg"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          const annotation = selectors.isActiveAnnotation("link")(
            editor.getSnapshot()
          );
          if (annotation) {
            editor.send({
              type: "annotation.remove",
              annotation: { name: "link" },
            });
            editor.send({ type: "focus" });
            return;
          }
          const href = window.prompt("URL");
          if (!href) return;
          editor.send({
            type: "annotation.add",
            annotation: { name: "link", value: { href } },
          });
          editor.send({ type: "focus" });
        }}
      >
        <LinkIcon size={16} />
      </button>
    </div>
  );
}

function DecoratorBtn({
  name,
  icon,
}: {
  name: "strong" | "em";
  icon: React.ReactNode;
}) {
  const editor = useEditor();
  const active = useEditorSelector(editor, selectors.isActiveDecorator(name));
  return (
    <button
      type="button"
      className={`p-1.5 rounded cursor-pointer ${active ? "text-primary" : "text-muted-fg hover:text-fg"}`}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => {
        editor.send({ type: "decorator.toggle", decorator: name });
        editor.send({ type: "focus" });
      }}
    >
      {icon}
    </button>
  );
}

function ListBtn({
  name,
  icon,
}: {
  name: "bullet" | "number";
  icon: React.ReactNode;
}) {
  const editor = useEditor();
  const active = useEditorSelector(editor, selectors.isActiveListItem(name));
  return (
    <button
      type="button"
      className={`p-1.5 rounded cursor-pointer ${active ? "text-primary" : "text-muted-fg hover:text-fg"}`}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => {
        editor.send({ type: "list item.toggle", listItem: name });
        editor.send({ type: "focus" });
      }}
    >
      {icon}
    </button>
  );
}

export default PtEditor;
