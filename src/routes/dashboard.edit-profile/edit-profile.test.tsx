import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

// --- mocks ---

const upload_mock = vi.hoisted(() => vi.fn());
vi.mock("#/helpers/upload-file", () => ({ uploadFile: upload_mock }));

// prevent transitive stripe/secrets import (process.env)
vi.mock("./api", () => ({
  loader: vi.fn(),
  action: vi.fn(),
}));

vi.mock("#/.server/toast", () => ({
  dataWithSuccess: vi.fn((_d: unknown, msg: string) => ({ toast: msg })),
}));

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

vi.mock("#/hooks/use-user", () => ({
  use_user: () => ({ user: undefined, revalidate: vi.fn() }),
}));

// mock cropper — it requires canvas and stylesheet
vi.mock("#/components/img-editor/img-cropper", () => ({
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
      </div>
    ) : null,
}));

// --- imports ---

import { createRoutesStub } from "react-router";
import Page from "./route";

// --- helpers ---

const MOCK_LOADER = {
  db_user: {
    email: "test@example.com",
    first_name: "Jane",
    last_name: "Doe",
    avatar_url: "",
    pref_currency: "usd",
  } as any,
  pref: { code: "usd", min: 1, rate: 1 },
  all: [
    { code: "usd", min: 1, rate: 1 },
    { code: "eur", min: 1, rate: 0.85 },
  ],
};

const action_spy = vi.hoisted(() => vi.fn());

async function render_page(loader_data = MOCK_LOADER) {
  const Stub = createRoutesStub([
    {
      path: "/dashboard/edit-profile",
      Component: Page,
      HydrateFallback: () => null,
      loader: () => loader_data,
      action: async ({ request }) => {
        const body = await request.json();
        action_spy(body);
        return { toast: "User profile updated" };
      },
    },
  ]);

  return await render(<Stub initialEntries={["/dashboard/edit-profile"]} />);
}

function select_file(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  Object.defineProperty(input, "files", { value: dt.files });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

// --- tests ---

afterEach(() => {
  vi.restoreAllMocks();
  action_spy.mockReset();
});

describe("dashboard edit-profile", () => {
  it("renders pre-filled form with submit disabled", async () => {
    const screen = await render_page();

    await expect
      .element(screen.getByLabelText(/first name/i))
      .toHaveDisplayValue("Jane");
    await expect
      .element(screen.getByLabelText(/last name/i))
      .toHaveDisplayValue("Doe");
    await expect
      .element(screen.getByRole("button", { name: /submit changes/i }))
      .toBeDisabled();
  });

  it("avatar upload: select file -> crop -> upload -> submit", async () => {
    upload_mock.mockResolvedValue("https://cdn.example.com/avatar.png");
    const screen = await render_page();

    await expect.element(screen.getByText(/upload file/i)).toBeVisible();

    // select a valid image file
    const input = screen.container.querySelector(
      "input[type='file']"
    ) as HTMLInputElement;

    const file = new File(["img"], "avatar.png", { type: "image/png" });
    select_file(input, file);

    // cropper opens
    await expect.element(screen.getByTestId("mock-cropper")).toBeVisible();

    // save crop triggers upload
    await screen.getByTestId("crop-save").click();

    // submit button becomes enabled after upload completes
    await expect
      .element(screen.getByRole("button", { name: /submit changes/i }))
      .toBeEnabled();

    // submit
    await screen.getByRole("button", { name: /submit changes/i }).click();

    // action receives avatar_url
    await vi.waitFor(() => {
      expect(action_spy).toHaveBeenCalledWith({
        avatar_url: "https://cdn.example.com/avatar.png",
      });
    });
  });

  it("avatar upload failure shows error, blocks submit", async () => {
    upload_mock.mockRejectedValue(new Error("upload failed"));
    const screen = await render_page();

    const input = screen.container.querySelector(
      "input[type='file']"
    ) as HTMLInputElement;

    const file = new File(["img"], "avatar.png", { type: "image/png" });
    select_file(input, file);

    // crop and save
    await expect.element(screen.getByTestId("mock-cropper")).toBeVisible();
    await screen.getByTestId("crop-save").click();

    // error message from valibot validation
    await expect.element(screen.getByText(/failed to upload/i)).toBeVisible();
  });

  it("avatar invalid type shows error", async () => {
    const screen = await render_page();

    const input = screen.container.querySelector(
      "input[type='file']"
    ) as HTMLInputElement;

    // gif is not in the accepted types
    const file = new File(["img"], "avatar.gif", { type: "image/gif" });
    select_file(input, file);

    await expect.element(screen.getByText(/invalid file type/i)).toBeVisible();
  });

  it("avatar exceeds size shows error", async () => {
    const screen = await render_page();

    const input = screen.container.querySelector(
      "input[type='file']"
    ) as HTMLInputElement;

    // 5MB exceeds 4MB limit
    const file = new File([new ArrayBuffer(5e6)], "big.png", {
      type: "image/png",
    });
    select_file(input, file);

    await expect.element(screen.getByText(/exceeds file size/i)).toBeVisible();
  });

  it("currency input restores selected label when closed after clear", async () => {
    const screen = await render_page();

    const combo = screen.getByRole("combobox", { name: /default currency/i });
    await expect.element(combo).toHaveDisplayValue("USD");

    // open, clear, dismiss without picking a new value
    await combo.click();
    await combo.fill("");
    // close popup via Escape so onOpenChange(false) fires
    (combo.element() as HTMLInputElement).focus();
    (combo.element() as HTMLInputElement).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );

    await expect.element(combo).toHaveDisplayValue("USD");
  });

  it("text field edit + submit sends only dirty fields", async () => {
    const screen = await render_page();

    await expect.element(screen.getByLabelText(/first name/i)).toBeVisible();

    const first_name = screen.getByLabelText(/first name/i);
    await first_name.clear();
    await first_name.fill("Updated");

    await screen.getByRole("button", { name: /submit changes/i }).click();

    await vi.waitFor(() => {
      expect(action_spy).toHaveBeenCalledWith({
        first_name: "Updated",
      });
    });
  });
});
