import { createRoutesStub } from "react-router";
import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import Page from "./route";

afterEach(async () => {
  await cleanup();
});

it("sends a new org on to the Better Giving Page section of its Organization page", async () => {
  const Stub = createRoutesStub([
    { path: "/register/success", Component: Page },
  ]);
  const screen = await render(
    <Stub initialEntries={["/register/success?name=Acme&id=7"]} />
  );

  await expect
    .element(
      screen.getByRole("heading", {
        name: "Acme’s account has been created!",
      })
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: /Start filling out Acme/ }))
    .toHaveAttribute("href", "/admin/7/organization#page");
});
