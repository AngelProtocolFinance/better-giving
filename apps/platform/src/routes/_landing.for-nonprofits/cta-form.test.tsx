import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { ILeadValues } from "@/reg/lead";
import { CtaForm, type ICtaFormErrors } from "./cta-form";

/** the action echoes every posted name; this page leaves the intl-only ones empty */
const posted = (over: Partial<ILeadValues> = {}): ILeadValues => ({
  o_name: "Riverside Youth Alliance",
  o_ein: "12-3456789",
  o_hq_country: "",
  o_registration_number: "",
  email: "dev@riverside.org",
  ...over,
});

interface Props {
  errors?: ICtaFormErrors;
  values?: ILeadValues;
  signed_in_as?: string;
  pending?: boolean;
}

function stub(props: Props = {}) {
  const posts: FormData[] = [];
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <CtaForm {...props} />,
      action: async ({ request }) => {
        posts.push(await request.formData());
        return null;
      },
    },
  ]);
  return { Stub, posts };
}

describe("CtaForm", () => {
  it("untouched form marks nothing", async () => {
    const { Stub } = stub();
    const screen = await render(<Stub />);

    await expect
      .element(screen.getByRole("button", { name: "Join free forever" }))
      .toBeVisible();
    expect(screen.getByText("required").query()).toBeNull();
    await expect
      .element(screen.getByLabelText(/nonprofit name/i))
      .not.toHaveAttribute("aria-invalid", "true");
  });

  it("required fields are marked without a native constraint blocking submit", async () => {
    const { Stub, posts } = stub();
    const screen = await render(<Stub />);

    for (const label of [/nonprofit name/i, /^ein/i, /work email/i]) {
      const input = screen.getByLabelText(label);
      await expect.element(input).not.toHaveAttribute("required");
    }

    // an empty post still reaches the action — validation is the action's
    await screen.getByRole("button", { name: "Join free forever" }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]!.get("o_name")).toBe("");
    expect(posts[0]!.get("email")).toBe("");
  });

  it("posts the org type, masked ein and honeypot alongside the typed values", async () => {
    const { Stub, posts } = stub();
    const screen = await render(<Stub />);

    await screen
      .getByLabelText(/nonprofit name/i)
      .fill("Riverside Youth Alliance");
    await screen.getByLabelText(/^ein/i).fill("123456789");
    await screen.getByLabelText(/work email/i).fill("dev@riverside.org");

    await screen.getByRole("button", { name: "Join free forever" }).click();
    await expect.poll(() => posts.length).toBe(1);

    const p = posts[0]!;
    expect(p.get("o_type")).toBe("501c3");
    expect(p.get("o_name")).toBe("Riverside Youth Alliance");
    expect(p.get("o_ein")).toBe("12-3456789");
    expect(p.get("email")).toBe("dev@riverside.org");
    expect(p.get("middle_name")).toBe("");
  });

  it("renders a message per field it came back marked with", async () => {
    const { Stub } = stub({
      errors: {
        o_name: "required",
        o_ein: "must be 9 digits",
        email: "invalid email",
      },
    });
    const screen = await render(<Stub />);

    await expect.element(screen.getByText("required")).toBeVisible();
    await expect.element(screen.getByText("must be 9 digits")).toBeVisible();
    await expect.element(screen.getByText("invalid email")).toBeVisible();

    for (const label of [/nonprofit name/i, /^ein/i, /work email/i]) {
      await expect
        .element(screen.getByLabelText(label))
        .toHaveAttribute("aria-invalid", "true");
    }
  });

  it("focus lands on the first field a failed submit marked", async () => {
    const { Stub } = stub({
      errors: { o_ein: "must be 9 digits", email: "invalid email" },
    });
    const screen = await render(<Stub />);

    await expect.element(screen.getByLabelText(/^ein/i)).toHaveFocus();
  });

  it("a failed submit repopulates the typed values, mask included", async () => {
    const { Stub } = stub({
      values: posted(),
      errors: { email: "That domain doesn't resolve" },
    });
    const screen = await render(<Stub />);

    await expect
      .element(screen.getByLabelText(/nonprofit name/i))
      .toHaveValue("Riverside Youth Alliance");
    await expect
      .element(screen.getByLabelText(/work email/i))
      .toHaveValue("dev@riverside.org");
    // the mask is controlled, so the echo has to seed its state or it comes
    // back blank — and the echo is already masked, so it goes in as-is
    await expect
      .element(screen.getByLabelText(/^ein/i))
      .toHaveValue("12-3456789");
  });

  it("the repopulated values are what post again, untouched", async () => {
    const { Stub, posts } = stub({
      values: posted(),
      errors: { email: "That domain doesn't resolve" },
    });
    const screen = await render(<Stub />);

    await screen.getByRole("button", { name: "Join free forever" }).click();
    await expect.poll(() => posts.length).toBe(1);

    const p = posts[0]!;
    expect(p.get("o_name")).toBe("Riverside Youth Alliance");
    expect(p.get("o_ein")).toBe("12-3456789");
    expect(p.get("email")).toBe("dev@riverside.org");
  });

  it("the summary names the failed fields in ask order", async () => {
    const { Stub } = stub({
      errors: { email: "invalid email", o_name: "required" },
    });
    const screen = await render(<Stub />);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(
        "Your account wasn't created. Check Nonprofit name, Work email."
      );
  });

  it("a session mismatch takes focus and marks no field", async () => {
    const { Stub } = stub({ signed_in_as: "jane@acme.org", errors: {} });
    const screen = await render(<Stub />);

    const notice = screen
      .getByText(/this browser is signed in as/i)
      .element()
      .closest("[role=alert]");
    expect(notice).toHaveFocus();
    expect(notice).toHaveTextContent("jane@acme.org");

    await expect
      .element(screen.getByLabelText(/nonprofit name/i))
      .not.toHaveAttribute("aria-invalid", "true");
  });

  it("pending disables the form and the button reports it", async () => {
    const { Stub } = stub({ pending: true });
    const screen = await render(<Stub />);

    const btn = screen.getByRole("button", { name: /submitting/i });
    await expect.element(btn).toBeVisible();
    await expect.element(btn).toBeDisabled();
    await expect
      .element(screen.getByLabelText(/nonprofit name/i))
      .toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Join free forever" }).query()
    ).toBeNull();
  });
});
