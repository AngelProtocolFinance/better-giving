import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

vi.mock("#/helpers/upload-file", () => ({
  uploadFile: vi.fn(),
}));

import { createRoutesStub } from "react-router";
import { FsaForm } from "./index";

async function render_form() {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <FsaForm />,
      HydrateFallback: () => null,
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("FsaForm focus-on-error", () => {
  it("submits empty → focuses first invalid FileDropzone (proof of identity)", async () => {
    const screen = await render_form();

    // fill the text fields ABOVE proof_of_reg so the only remaining errors
    // are the two FileDropzones — verifies the FIRST invalid field (poi)
    // wins focus regardless of fields below it.
    await screen.getByLabelText(/registration number/i).fill("REG-12345");

    await screen.getByRole("button", { name: /sign/i }).click();

    // RHF setFocus targets the FileDropzone Root (a focusable div via
    // tabIndex=-1). Browser scroll-into-view + scroll-mt-24 lift it
    // above the sticky header.
    await vi.waitFor(() => {
      const active = document.activeElement;
      const dropzone = screen.container.querySelectorAll(
        "[data-scope='file-upload'][data-part='root']"
      )[0];
      expect(active).toBe(dropzone);
    });
  });
});
