import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { RichTextContent } from "#/types/components";
import { RichText } from ".";

function slate_json(text: string) {
  return JSON.stringify([{ type: "paragraph", children: [{ text }] }]);
}

function rich_content(text: string): RichTextContent {
  return { value: slate_json(text), length: text.length };
}

const EMPTY: RichTextContent = { value: "", length: 0 };

// wrapper that wires up RichText with onChange state
function EditorHarness({
  initial = EMPTY,
  char_limit,
  on_change,
}: {
  initial?: RichTextContent;
  char_limit?: number;
  on_change?: (c: RichTextContent) => void;
}) {
  const ref = useRef<{ focus: () => void }>(null);
  const [content, set_content] = [initial, on_change ?? vi.fn()];

  return (
    <div style={{ height: 300 }}>
      <RichText
        ref={ref}
        content={content}
        onChange={(c) => set_content(c as RichTextContent)}
        placeHolder="Write something"
        charLimit={char_limit}
        classes={{
          field:
            "rich-text-toolbar border text-sm grid grid-rows-[auto_1fr] rounded bg-input p-3 min-h-[15rem]",
          counter: "text-muted-fg",
        }}
      />
      <button type="button" onClick={() => ref.current?.focus()}>
        Focus editor
      </button>
    </div>
  );
}

// stateful harness — char counter needs re-render on change
function StatefulEditor({
  initial = EMPTY,
  char_limit,
}: {
  initial?: RichTextContent;
  char_limit?: number;
}) {
  const [content, set_content] = useState(initial);

  return (
    <div style={{ height: 300 }}>
      <RichText
        content={content}
        onChange={set_content}
        placeHolder="Write something"
        charLimit={char_limit}
        classes={{
          field:
            "rich-text-toolbar border text-sm grid grid-rows-[auto_1fr] rounded bg-input p-3 min-h-[15rem]",
          counter: "text-muted-fg",
        }}
      />
    </div>
  );
}

describe("rich text editor — toolbar", () => {
  it("renders bold/italic/list/link buttons", async () => {
    const screen = await render(<EditorHarness />);

    await vi.waitFor(() => {
      const toolbar = screen.container.querySelector(".border-b.border-muted");
      expect(toolbar).not.toBeNull();
      const btns = toolbar!.querySelectorAll(":scope > button");
      // bold, italic, ordered-list, bulleted-list (link is fragment sibling)
      expect(btns.length).toBeGreaterThanOrEqual(4);
    });
  });

  it("bold button applies bold formatting", async () => {
    const on_change = vi.fn();
    const screen = await render(<EditorHarness on_change={on_change} />);

    const editor = screen.container.querySelector(
      "[data-slate-editor]"
    ) as HTMLElement;
    editor.click();
    await userEvent.keyboard("normal ");

    // click bold button
    const toolbar = screen.container.querySelector(".border-b.border-muted")!;
    const bold_btn = toolbar.querySelectorAll(
      ":scope > button"
    )[0] as HTMLElement;
    bold_btn.click();
    await userEvent.keyboard("bold");

    const last = on_change.mock.calls.at(-1)![0];
    expect(last.value).toContain('"bold":true');
  });

  it("italic button applies italic formatting", async () => {
    const on_change = vi.fn();
    const screen = await render(<EditorHarness on_change={on_change} />);

    const editor = screen.container.querySelector(
      "[data-slate-editor]"
    ) as HTMLElement;
    editor.click();

    // click italic button
    const toolbar = screen.container.querySelector(".border-b.border-muted")!;
    const italic_btn = toolbar.querySelectorAll(
      ":scope > button"
    )[1] as HTMLElement;
    italic_btn.click();
    await userEvent.keyboard("italic");

    const last = on_change.mock.calls.at(-1)![0];
    expect(last.value).toContain('"italic":true');
  });
});

describe("rich text editor — keyboard shortcuts", () => {
  it("Cmd+B toggles bold", async () => {
    const on_change = vi.fn();
    const screen = await render(<EditorHarness on_change={on_change} />);

    const editor = screen.container.querySelector(
      "[data-slate-editor]"
    ) as HTMLElement;
    editor.click();

    await userEvent.keyboard("{Meta>}b{/Meta}");
    await userEvent.keyboard("bolded");

    const last = on_change.mock.calls.at(-1)![0];
    expect(last.value).toContain('"bold":true');
  });

  it("Cmd+I toggles italic", async () => {
    const on_change = vi.fn();
    const screen = await render(<EditorHarness on_change={on_change} />);

    const editor = screen.container.querySelector(
      "[data-slate-editor]"
    ) as HTMLElement;
    editor.click();

    await userEvent.keyboard("{Meta>}i{/Meta}");
    await userEvent.keyboard("italicized");

    const last = on_change.mock.calls.at(-1)![0];
    expect(last.value).toContain('"italic":true');
  });
});

describe("rich text editor — lists", () => {
  it("bulleted list button creates ul > li", async () => {
    const on_change = vi.fn();
    const screen = await render(<EditorHarness on_change={on_change} />);

    const editor = screen.container.querySelector(
      "[data-slate-editor]"
    ) as HTMLElement;
    editor.click();

    // click bulleted-list button (index 3)
    const toolbar = screen.container.querySelector(".border-b.border-muted")!;
    const list_btn = toolbar.querySelectorAll(
      ":scope > button"
    )[3] as HTMLElement;
    list_btn.click();
    await userEvent.keyboard("item");

    await expect.element(screen.getByRole("list")).toBeVisible();
    await expect.element(screen.getByRole("listitem")).toBeVisible();

    const last = on_change.mock.calls.at(-1)![0];
    expect(last.value).toContain('"bulleted-list"');
  });

  it("numbered list button creates ol > li", async () => {
    const on_change = vi.fn();
    const screen = await render(<EditorHarness on_change={on_change} />);

    const editor = screen.container.querySelector(
      "[data-slate-editor]"
    ) as HTMLElement;
    editor.click();

    // click numbered-list button (index 2)
    const toolbar = screen.container.querySelector(".border-b.border-muted")!;
    const list_btn = toolbar.querySelectorAll(
      ":scope > button"
    )[2] as HTMLElement;
    list_btn.click();
    await userEvent.keyboard("step");

    await expect.element(screen.getByRole("list")).toBeVisible();

    const last = on_change.mock.calls.at(-1)![0];
    expect(last.value).toContain('"numbered-list"');
  });

  it("toggle list off reverts to paragraph", async () => {
    const on_change = vi.fn();
    const screen = await render(<EditorHarness on_change={on_change} />);

    const editor = screen.container.querySelector(
      "[data-slate-editor]"
    ) as HTMLElement;
    editor.click();

    const toolbar = screen.container.querySelector(".border-b.border-muted")!;
    const list_btn = toolbar.querySelectorAll(
      ":scope > button"
    )[3] as HTMLElement;

    // toggle on
    list_btn.click();
    await userEvent.keyboard("item");
    await expect.element(screen.getByRole("list")).toBeVisible();

    // select all text so the toggle applies to it
    await userEvent.keyboard("{Meta>}a{/Meta}");
    // toggle off
    list_btn.click();

    await expect.element(screen.getByRole("list")).not.toBeInTheDocument();
  });
});

describe("rich text editor — char counter", () => {
  it("shows char count and limit", async () => {
    const screen = await render(
      <StatefulEditor initial={rich_content("hello")} char_limit={500} />
    );

    await expect
      .element(screen.getByText(/chars\s*:\s*5\s*\/500/i))
      .toBeVisible();
  });

  it("updates count on typing", async () => {
    const screen = await render(
      <StatefulEditor initial={EMPTY} char_limit={100} />
    );

    // initial: 0
    await expect.element(screen.getByText(/chars\s*:\s*0/)).toBeVisible();

    const editor = screen.container.querySelector(
      "[data-slate-editor]"
    ) as HTMLElement;
    editor.click();
    await userEvent.keyboard("abc");

    await expect.element(screen.getByText(/chars\s*:\s*3/)).toBeVisible();
  });
});

describe("rich text editor — focus", () => {
  it("click empty area focuses editor", async () => {
    const screen = await render(<EditorHarness />);

    // click the cursor-text wrapper (empty area), not the textbox itself
    const wrapper = screen.container.querySelector(
      ".cursor-text"
    ) as HTMLElement;
    wrapper.click();

    await vi.waitFor(() => {
      const doc = screen.container.ownerDocument;
      expect(doc.activeElement?.getAttribute("data-slate-editor")).toBe("true");
    });
  });

  it("imperative focus() works via ref", async () => {
    const screen = await render(<EditorHarness />);

    // click the external "Focus editor" button
    await screen.getByRole("button", { name: /focus editor/i }).click();

    await vi.waitFor(() => {
      const doc = screen.container.ownerDocument;
      expect(doc.activeElement?.getAttribute("data-slate-editor")).toBe("true");
    });
  });
});

describe("rich text editor — read-only", () => {
  it("no toolbar rendered", async () => {
    const content = rich_content("read only");
    const screen = await render(<RichText content={content} readOnly />);

    await expect.element(screen.getByText("read only")).toBeVisible();
    const toolbar = screen.container.querySelector(".border-b.border-muted");
    expect(toolbar).toBeNull();
  });

  it("renders bold/italic/link marks", async () => {
    const value = JSON.stringify([
      {
        type: "paragraph",
        children: [
          { text: "normal " },
          { text: "bold", bold: true },
          { text: " " },
          { text: "italic", italic: true },
          { text: " " },
          { text: "link", link: "https://example.com" },
        ],
      },
    ]);
    const screen = await render(
      <RichText content={{ value, length: 24 }} readOnly />
    );

    await vi.waitFor(() => {
      expect(screen.container.querySelector("strong")?.textContent).toBe(
        "bold"
      );
      expect(screen.container.querySelector("em")?.textContent).toBe("italic");
      const a = screen.container.querySelector("a");
      expect(a?.getAttribute("href")).toBe("https://example.com");
      expect(a?.getAttribute("target")).toBe("_blank");
    });
  });

  it("renders bulleted list", async () => {
    const value = JSON.stringify([
      {
        type: "bulleted-list",
        children: [
          { type: "list-item", children: [{ text: "one" }] },
          { type: "list-item", children: [{ text: "two" }] },
        ],
      },
    ]);
    const screen = await render(
      <RichText content={{ value, length: 6 }} readOnly />
    );

    const items = screen.getByRole("listitem").all();
    expect(items).toHaveLength(2);
  });
});

describe("rich text editor — onChange", () => {
  it("emits empty value when all text deleted", async () => {
    const on_change = vi.fn();
    const screen = await render(<EditorHarness on_change={on_change} />);

    const editor = screen.container.querySelector(
      "[data-slate-editor]"
    ) as HTMLElement;
    editor.click();
    // type then delete — avoids cursor-positioning issues with non-empty
    // initialValue, where editor.click() focuses but cursor stays at offset 0.
    await userEvent.keyboard("abc");
    await vi.waitFor(() => {
      expect(on_change.mock.calls.at(-1)![0].length).toBe(3);
    });
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}");
    await vi.waitFor(() => {
      expect(on_change.mock.calls.at(-1)![0].length).toBe(0);
    });
  });

  it("emits slate json with correct length", async () => {
    const on_change = vi.fn();
    const screen = await render(<EditorHarness on_change={on_change} />);

    const editor = screen.container.querySelector(
      "[data-slate-editor]"
    ) as HTMLElement;
    editor.click();
    await userEvent.keyboard("hello");

    await vi.waitFor(() => {
      const last = on_change.mock.calls.at(-1)![0];
      expect(last.length).toBe(5);
      expect(last.value).toContain('"hello"');
    });
  });
});
