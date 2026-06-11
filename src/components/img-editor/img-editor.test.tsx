import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ImgEditor } from "./img-editor";
import type { ControlledProps, ImgSpec } from "./types";

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
});
