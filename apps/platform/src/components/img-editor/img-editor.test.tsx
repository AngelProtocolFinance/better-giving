import { useController, useForm } from "react-hook-form";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
// the preview branch hides the file input in css (`hidden`), and whether that
// input can take focus is the whole point of the fallback — so the real
// stylesheet must be loaded for that case to be observable.
import "#/index.css";
import { ImgEditor } from "./img-editor";
import type { ControlledProps, ImgOutput, ImgSpec } from "./types";

const upload_mock = vi.hoisted(() => vi.fn());
vi.mock("#/helpers/upload-file", () => ({
  uploadFile: upload_mock,
}));

// mock cropper — it requires canvas and stylesheet
vi.mock("./img-cropper", () => ({
  ImgCropper: (props: {
    is_open: boolean;
    onSave: (f: File) => void;
    onClose: () => void;
    input: File;
  }) =>
    props.is_open ? (
      <div data-testid="mock-cropper">
        <button
          type="button"
          onClick={() => props.onSave(props.input)}
          data-testid="crop-save"
        >
          Save crop
        </button>
        <button type="button" onClick={props.onClose} data-testid="crop-close">
          Close crop
        </button>
      </div>
    ) : null,
}));

const spec: ImgSpec = {
  type: ["image/jpeg", "image/png"],
  aspect: [4, 1] as [number, number],
  max_size: 5e6,
};

function make_props(overrides?: Partial<ControlledProps>): ControlledProps {
  return {
    value: "",
    on_change: vi.fn(),
    on_undo: vi.fn(),
    spec,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ImgEditor", () => {
  test("renders upload prompt and valid types when no image", async () => {
    const props = make_props();
    const screen = await render(<ImgEditor {...props} />);

    await expect.element(screen.getByText(/upload file/i)).toBeVisible();
    await expect
      .element(screen.getByText(/click to browse or drag & drop/i))
      .toBeVisible();
    await expect.element(screen.getByText(/JPEG, PNG/)).toBeVisible();
    await expect.element(screen.getByText(/less than 5MB/)).toBeVisible();
  });

  test("shows aspect ratio tooltip for known ratios", async () => {
    const props = make_props();
    const screen = await render(<ImgEditor {...props} />);

    // 4:1 aspect shows recommended size
    await expect.element(screen.getByText(/4:1/)).toBeVisible();
  });

  test("rejects invalid file type", async () => {
    const on_change = vi.fn();
    const props = make_props({ on_change });
    const screen = await render(<ImgEditor {...props} />);

    const input = screen.container.querySelector(
      "input[type='file']"
    ) as HTMLInputElement;

    const bad_file = new File(["data"], "file.svg", {
      type: "image/svg+xml",
    });

    const dt = new DataTransfer();
    dt.items.add(bad_file);
    Object.defineProperty(input, "files", { value: dt.files });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() =>
      expect(on_change).toHaveBeenCalledWith("invalid-type")
    );
  });

  test("rejects file exceeding size limit", async () => {
    const on_change = vi.fn();
    const props = make_props({ on_change });
    const screen = await render(<ImgEditor {...props} />);

    const input = screen.container.querySelector(
      "input[type='file']"
    ) as HTMLInputElement;

    // 6MB exceeds 5MB limit
    const big_file = new File([new ArrayBuffer(6e6)], "big.png", {
      type: "image/png",
    });

    const dt = new DataTransfer();
    dt.items.add(big_file);
    Object.defineProperty(input, "files", { value: dt.files });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() =>
      expect(on_change).toHaveBeenCalledWith("exceeds-size")
    );
  });

  test("valid file opens cropper, save triggers upload", async () => {
    upload_mock.mockResolvedValue("https://cdn.example.com/cropped.png");
    const on_change = vi.fn();
    const props = make_props({ on_change });
    const screen = await render(<ImgEditor {...props} />);

    const input = screen.container.querySelector(
      "input[type='file']"
    ) as HTMLInputElement;

    const valid_file = new File(["img"], "photo.png", {
      type: "image/png",
    });

    const dt = new DataTransfer();
    dt.items.add(valid_file);
    Object.defineProperty(input, "files", { value: dt.files });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    // cropper should open
    await expect.element(screen.getByTestId("mock-cropper")).toBeVisible();

    // save the crop
    await screen.getByTestId("crop-save").click();

    // should trigger loading then URL
    await vi.waitFor(() => expect(on_change).toHaveBeenCalledWith("loading"));
    await vi.waitFor(() =>
      expect(on_change).toHaveBeenCalledWith(
        "https://cdn.example.com/cropped.png"
      )
    );
  });

  test("upload failure calls on_change('failure')", async () => {
    upload_mock.mockRejectedValue(new Error("upload failed"));
    const on_change = vi.fn();
    const props = make_props({ on_change });
    const screen = await render(<ImgEditor {...props} />);

    const input = screen.container.querySelector(
      "input[type='file']"
    ) as HTMLInputElement;

    const valid_file = new File(["img"], "photo.png", {
      type: "image/png",
    });

    const dt = new DataTransfer();
    dt.items.add(valid_file);
    Object.defineProperty(input, "files", { value: dt.files });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    // save crop to trigger upload
    await expect.element(screen.getByTestId("mock-cropper")).toBeVisible();
    await screen.getByTestId("crop-save").click();

    await vi.waitFor(() => expect(on_change).toHaveBeenCalledWith("failure"));
  });

  test("disabled state prevents interaction", async () => {
    const props = make_props({ disabled: true });
    const screen = await render(<ImgEditor {...props} />);

    await vi.waitFor(() => {
      const dropzone = screen.container.querySelector('[data-disabled="true"]');
      expect(dropzone).not.toBeNull();
    });
  });

  test("shows error message", async () => {
    const props = make_props({ error: "invalid file type" });
    const screen = await render(<ImgEditor {...props} />);

    await expect.element(screen.getByText("invalid file type")).toBeVisible();
  });

  // the preview writes `value` straight into `background: url(...)`, so a
  // sentinel reaching that branch requests a relative path that does not exist
  // and puts the file input under `hidden group-hover:flex` — a pointer-only
  // way out of a state the user never chose. reachable without a local `file`:
  // a value restored from the server, or written back after the file cleared.
  test.each([
    "loading",
    "invalid-type",
    "exceeds-size",
    "failure",
  ] as const)("the %s sentinel is not rendered as a background url", async (sentinel) => {
    const props = make_props({ value: sentinel });
    const screen = await render(<ImgEditor {...props} />);

    await vi.waitFor(() => {
      const dropzone = screen.container.querySelector("label");
      expect(dropzone?.style.background).toBe("");
    });
    // no preview means the upload prompt, not the hover-only control
    await expect.element(screen.getByText("Upload file")).toBeVisible();
  });
});

/** what the call sites render immediately before the editor. the editor's own
 * root carries no accessible name, so the visible label is the only stable
 * handle on one specific editor. */
const LABEL = "Banner image of your organization";
/** a 1x1 gif: the preview goes into `background: url(...)`, and a http url
 * there is a real unmocked fetch out of the test browser */
const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** the shape every call site uses: a controller-driven editor whose rule fails,
 * with a text field BELOW it — so a submit exercises RHF's default
 * focus-on-error rather than an explicit `setFocus` */
function RHFHarness(props: {
  initial?: ImgOutput;
  rule?: (v: ImgOutput) => true | string;
  /** makes the field below invalid too, so the two compete for focus */
  text_required?: boolean;
}) {
  const { control, handleSubmit, register } = useForm<{
    image: ImgOutput;
    title: string;
  }>({
    defaultValues: { image: props.initial ?? "", title: "" },
  });
  const { field } = useController({
    control,
    name: "image",
    rules: { validate: props.rule ?? ((v) => !!v || "required") },
  });

  return (
    <form onSubmit={handleSubmit(() => {})}>
      <p>{LABEL}</p>
      <ImgEditor
        ref={field.ref}
        value={field.value}
        on_change={field.onChange}
        on_undo={() => field.onChange("")}
        spec={spec}
      />
      <input
        aria-label="Title"
        {...register("title", {
          required: props.text_required ? "required" : false,
        })}
      />
      <button type="submit">Submit</button>
    </form>
  );
}

describe("ImgEditor: focus target", () => {
  test("failed submit focuses the file input and scrolls the field into view", async () => {
    const screen = await render(<RHFHarness />);
    const root = screen.getByText(LABEL).element()
      .nextElementSibling as HTMLElement;
    const scroll = vi.spyOn(root, "scrollIntoView");

    await screen.getByRole("button", { name: /submit/i }).click();

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(
        root.querySelector("input[type='file']")
      );
      expect(scroll).toHaveBeenCalledWith({ block: "start" });
    });
  });

  test("wins focus over an invalid field below it", async () => {
    const screen = await render(<RHFHarness text_required />);
    const root = screen.getByText(LABEL).element()
      .nextElementSibling as HTMLElement;
    const scroll = vi.spyOn(root, "scrollIntoView");

    await screen.getByRole("button", { name: /submit/i }).click();

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(
        root.querySelector("input[type='file']")
      );
      // focus alone does not move the page; the scroll is the half this case
      // turns on
      expect(scroll).toHaveBeenCalledWith({ block: "start" });
    });
    // without a focusable handle RHF skips the image and lands here instead
    expect(document.activeElement).not.toBe(
      screen.getByLabelText("Title").element()
    );
  });

  test("preview branch: the dropzone takes focus and still scrolls", async () => {
    const screen = await render(
      <RHFHarness initial={PIXEL} rule={() => "rejected"} />
    );
    const root = screen.getByText(LABEL).element()
      .nextElementSibling as HTMLElement;
    const scroll = vi.spyOn(root, "scrollIntoView");

    await screen.getByRole("button", { name: /submit/i }).click();

    // the file input lives under `hidden` here, so focus() on it is a no-op —
    // the dropzone takes it instead, where the focus-within ring paints
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(root.querySelector("label"));
      expect(scroll).toHaveBeenCalledWith({ block: "start" });
    });
  });
});
