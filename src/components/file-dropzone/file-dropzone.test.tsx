import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { FileDropzone } from "./file-dropzone";
import type { FileSpec } from "./types";

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
      <FileDropzone value="" onChange={on_change} specs={specs} />
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
      <FileDropzone value="loading" onChange={on_change} specs={specs} />
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
      <FileDropzone value="" onChange={on_change} specs={specs} />
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
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() =>
      expect(on_change).toHaveBeenCalledWith("invalid-type")
    );
  });

  test("rejects file exceeding size limit", async () => {
    const on_change = vi.fn();
    const screen = await render(
      <FileDropzone value="" onChange={on_change} specs={specs} />
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
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() =>
      expect(on_change).toHaveBeenCalledWith("exceeds-size")
    );
  });

  test("uploads valid file and calls onChange with URL", async () => {
    upload_mock.mockResolvedValue("https://cdn.example.com/uploaded.png");
    const on_change = vi.fn();

    const screen = await render(
      <FileDropzone value="" onChange={on_change} specs={specs} />
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
    input.dispatchEvent(new Event("change", { bubbles: true }));

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
      <FileDropzone value="" onChange={on_change} specs={specs} />
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
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(on_change).toHaveBeenCalledWith("failure"));
  });

  test("disabled state prevents interaction", async () => {
    const on_change = vi.fn();
    const screen = await render(
      <FileDropzone
        value=""
        onChange={on_change}
        specs={specs}
        disabled={true}
      />
    );

    // dropzone should have disabled data attribute
    await vi.waitFor(() => {
      const dropzone = screen.container.querySelector('[data-disabled="true"]');
      expect(dropzone).not.toBeNull();
    });
  });
});
