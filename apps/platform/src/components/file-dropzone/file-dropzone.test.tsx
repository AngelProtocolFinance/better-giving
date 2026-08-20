import { useController, useForm } from "react-hook-form";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { FileDropzone } from "./file-dropzone";
import type { FileOutput, FileSpec } from "./types";

const upload_mock = vi.hoisted(() => vi.fn());
vi.mock("#/helpers/upload-file", () => ({
  uploadFile: upload_mock,
}));

const specs: FileSpec = {
  mbLimit: 6,
  mimeTypes: ["image/jpeg", "image/png", "application/pdf"],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FileDropzone", () => {
  test("renders upload prompt and valid types", async () => {
    const on_change = vi.fn();
    const screen = await render(
      <FileDropzone
        dropzone_name="Supporting document"
        value=""
        onChange={on_change}
        specs={specs}
      />
    );

    await expect.element(screen.getByText(/upload file/i)).toBeVisible();
    await expect
      .element(screen.getByText(/click to browse or drag & drop/i))
      .toBeVisible();
    await expect.element(screen.getByText(/JPEG, PNG, PDF/)).toBeVisible();
    await expect.element(screen.getByText(/less than 6 MB/)).toBeVisible();
  });

  test("shows loading state when value is 'loading'", async () => {
    const on_change = vi.fn();
    const screen = await render(
      <FileDropzone
        dropzone_name="Supporting document"
        value="loading"
        onChange={on_change}
        specs={specs}
      />
    );

    // loading spinner visible, upload prompt hidden
    await expect
      .element(screen.getByText(/upload file/i))
      .not.toBeInTheDocument();
  });

  test("shows uploaded file link when value is a URL", async () => {
    const on_change = vi.fn();
    const screen = await render(
      <FileDropzone
        dropzone_name="Supporting document"
        value="https://example.com/file.pdf"
        onChange={on_change}
        specs={specs}
      />
    );

    await expect
      .element(screen.getByText("https://example.com/file.pdf"))
      .toBeVisible();
  });

  test("shows error message when error prop is set", async () => {
    const on_change = vi.fn();
    const screen = await render(
      <FileDropzone
        dropzone_name="Supporting document"
        value=""
        onChange={on_change}
        specs={specs}
        error="required"
      />
    );

    await expect.element(screen.getByText("required")).toBeVisible();
  });

  test("rejects invalid file type", async () => {
    const on_change = vi.fn();
    const screen = await render(
      <FileDropzone
        dropzone_name="Supporting document"
        value=""
        onChange={on_change}
        specs={specs}
      />
    );

    const input = screen.container.querySelector(
      "input[type='file']"
    ) as HTMLInputElement;

    const bad_file = new File(["data"], "file.txt", {
      type: "text/plain",
    });

    // simulate drop via native input change
    const dt = new DataTransfer();
    dt.items.add(bad_file);
    Object.defineProperty(input, "files", { value: dt.files });
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() =>
      expect(on_change).toHaveBeenCalledWith("invalid-type")
    );
  });

  test("rejects file exceeding size limit", async () => {
    const on_change = vi.fn();
    const screen = await render(
      <FileDropzone
        dropzone_name="Supporting document"
        value=""
        onChange={on_change}
        specs={specs}
      />
    );

    const input = screen.container.querySelector(
      "input[type='file']"
    ) as HTMLInputElement;

    // 7MB file exceeds 6MB limit
    const big_file = new File([new ArrayBuffer(7e6)], "big.png", {
      type: "image/png",
    });

    const dt = new DataTransfer();
    dt.items.add(big_file);
    Object.defineProperty(input, "files", { value: dt.files });
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() =>
      expect(on_change).toHaveBeenCalledWith("exceeds-size")
    );
  });

  test("uploads valid file and calls onChange with URL", async () => {
    upload_mock.mockResolvedValue("https://cdn.example.com/uploaded.png");
    const on_change = vi.fn();

    const screen = await render(
      <FileDropzone
        dropzone_name="Supporting document"
        value=""
        onChange={on_change}
        specs={specs}
      />
    );

    const input = screen.container.querySelector(
      "input[type='file']"
    ) as HTMLInputElement;

    const valid_file = new File(["img"], "photo.png", {
      type: "image/png",
    });

    const dt = new DataTransfer();
    dt.items.add(valid_file);
    Object.defineProperty(input, "files", { value: dt.files });
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // first call: "loading"
    await vi.waitFor(() => expect(on_change).toHaveBeenCalledWith("loading"));

    // second call: uploaded URL
    await vi.waitFor(() =>
      expect(on_change).toHaveBeenCalledWith(
        "https://cdn.example.com/uploaded.png"
      )
    );
  });

  test("calls onChange('failure') when upload fails", async () => {
    upload_mock.mockRejectedValue(new Error("network error"));
    const on_change = vi.fn();

    const screen = await render(
      <FileDropzone
        dropzone_name="Supporting document"
        value=""
        onChange={on_change}
        specs={specs}
      />
    );

    const input = screen.container.querySelector(
      "input[type='file']"
    ) as HTMLInputElement;

    const valid_file = new File(["img"], "photo.png", {
      type: "image/png",
    });

    const dt = new DataTransfer();
    dt.items.add(valid_file);
    Object.defineProperty(input, "files", { value: dt.files });
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.waitFor(() => expect(on_change).toHaveBeenCalledWith("failure"));
  });

  test("disabled state prevents interaction", async () => {
    const on_change = vi.fn();
    const screen = await render(
      <FileDropzone
        dropzone_name="Supporting document"
        value=""
        onChange={on_change}
        specs={specs}
        disabled={true}
      />
    );

    // dropzone should have disabled data attribute
    await vi.waitFor(() => {
      const dropzone = screen.container.querySelector("[data-disabled]");
      expect(dropzone).not.toBeNull();
    });
  });
});

/** the shape the bank-details and fsa steps use: a controller-driven dropzone
 * whose rule fails on an empty value, so a submit exercises RHF's default
 * focus-on-error rather than an explicit `setFocus` */
function RHFHarness() {
  const { control, handleSubmit } = useForm<{ bankStatement: FileOutput }>({
    defaultValues: { bankStatement: "" },
  });
  const { field } = useController({
    control,
    name: "bankStatement",
    rules: { validate: (v) => !!v || "required" },
  });

  return (
    <form onSubmit={handleSubmit(() => {})}>
      <FileDropzone
        ref={field.ref}
        dropzone_name="Bank statement"
        value={field.value}
        onChange={field.onChange}
        specs={specs}
      />
      <button type="submit">Submit</button>
    </form>
  );
}

describe("FileDropzone: focus target", () => {
  test("failed submit focuses a control with an accessible name", async () => {
    const screen = await render(<RHFHarness />);

    await screen.getByRole("button", { name: /submit/i }).click();

    await vi.waitFor(() => {
      const active = document.activeElement;
      expect(active?.getAttribute("data-part")).toBe("dropzone");
      expect(active?.getAttribute("role")).toBe("button");
      expect(active?.getAttribute("aria-label")).toBe("Bank statement");
    });
  });

  test("points the control at its error text", async () => {
    const screen = await render(
      <FileDropzone
        dropzone_name="Supporting document"
        value=""
        onChange={() => {}}
        specs={specs}
        error="required"
      />
    );

    const dropzone = screen.container.querySelector("[data-part='dropzone']");
    const err_id = dropzone?.getAttribute("aria-describedby");
    expect(err_id).toBeTruthy();

    expect(
      screen.container.querySelector(`#${CSS.escape(err_id!)}`)
    ).toHaveTextContent("required");
  });
});
