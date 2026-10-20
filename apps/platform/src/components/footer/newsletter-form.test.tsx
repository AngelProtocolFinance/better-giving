import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { NewsletterForm } from "./newsletter-form";

/** "/" route whose action stays pending until `release` is called */
const held_stub = () => {
  const posts: FormData[] = [];
  let release = () => {};
  // created up front so a release that lands before the action starts still counts
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: NewsletterForm,
      HydrateFallback: () => null,
      action: async ({ request }) => {
        posts.push(await request.formData());
        await gate;
        return "success";
      },
    },
  ]);
  return { Stub, posts, release };
};

describe("newsletter form submit", () => {
  test("locks while the subscribe request is in flight, so a second press sends nothing", async () => {
    const { Stub, posts, release } = held_stub();
    const screen = await render(<Stub />);

    const email = screen.getByRole("textbox", { name: "Email address" });
    const subscribe = screen.getByRole("button", { name: "Subscribe" });

    await email.fill("ops@nonprofit.org");
    await subscribe.click();

    await expect.element(subscribe).toBeDisabled();
    await expect.element(email).toBeDisabled();

    // force: past playwright's enabled check, the press a user would make
    await subscribe.click({ force: true });

    release();

    await expect
      .element(screen.getByText(/the form was sent successfully/i))
      .toBeVisible();
    expect(posts).toHaveLength(1);
    expect(posts[0].get("email")).toBe("ops@nonprofit.org");
    expect(posts[0].get("intent")).toBe("subscribe");
  });

  test("unlocks after the response and shows the success line once", async () => {
    const { Stub, release } = held_stub();
    const screen = await render(<Stub />);

    const email = screen.getByRole("textbox", { name: "Email address" });
    const subscribe = screen.getByRole("button", { name: "Subscribe" });

    await email.fill("ops@nonprofit.org");
    await subscribe.click();
    await expect.element(subscribe).toBeDisabled();

    release();

    await expect.element(subscribe).toBeEnabled();
    await expect.element(email).toBeEnabled();
    expect(
      screen.getByText(/the form was sent successfully/i).elements()
    ).toHaveLength(1);
  });
});
