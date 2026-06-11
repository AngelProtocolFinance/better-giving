---
name: test-writer
description: "Use when writing, modifying, or reviewing component tests, integration tests, or route tests in this React Router v7 web app. Triggers on *.test.tsx, *.test.ts files."
globs:
  - "src/**/*.test.tsx"
  - "src/**/*.test.ts"
---

# Test Writer — Vitest Browser Mode

Tests run in **real headless Chromium** via `@vitest/browser` + Playwright. Render with `vitest-browser-react`. No jsdom, no happy-dom, no `@testing-library/*`.

Setup: `src/setup-tests-browser.ts` (MSW worker, qstash capture).
Config: `vite.config.ts` → `test.browser`.

## Running Tests

Always use `--bail 1` to fail fast on first error:

```bash
pnpm vitest run --bail 1 src/path/to/test.test.tsx
```

## Rendering

`render()` is async and returns the scoped `screen` object with all locator methods.

```tsx
import { render } from "vitest-browser-react";

const screen = await render(<MyComponent />);
```

**Never** import `screen` from a global — always use the return value of `render()`.

## Locator Queries

Queries are on the `screen` object returned by `render()`. They return **locators** (not DOM elements) that auto-retry on interaction.

| Priority | Query | Use for |
|----------|-------|---------|
| 1 | `screen.getByRole("button", { name: /submit/i })` | buttons, tabs, radios, switches, comboboxes, dialogs, links |
| 2 | `screen.getByLabelText(/first name/i)` | form fields with visible labels |
| 3 | `screen.getByPlaceholder(/enter amount/i)` | inputs without visible labels |
| 4 | `screen.getByText(/please enter/i)` | non-interactive text, validation messages |
| 5 | `screen.getByTestId("donate-methods")` | last resort — no accessible role/label |

Additional locator methods: `getByAltText`, `getByTitle`.

### No `getAllBy*` — use locator methods

There is no `getAllByRole`, `getAllByText`, etc. A single `getBy*` returns a locator that can match multiple elements:

```tsx
// index into matches
screen.getByRole("button", { name: /save/i }).nth(0).click();
screen.getByRole("option").first().click();

// get all as locator array
const links = screen.getByRole("link", { name: /edit/i }).all();

// get all as DOM elements (for length checks, iteration)
screen.getByRole("row").elements().length;

// count via container (alternative)
screen.container.querySelectorAll('[data-testid="incrementer"]').length;
```

### Strict mode — use `{ exact: true }` for ambiguous text

Locators match **substrings** by default. `getByText("tip")` matches "tip", "Tips", "Tooltip". Use `{ exact: true }` when the text is common:

```tsx
screen.getByText("tip", { exact: true })
screen.getByText("US", { exact: true }) // avoids matching "USD"
screen.getByRole("heading", { name: "Active", exact: true }) // avoids "Inactive"
```

### Scoped locators

```tsx
// scoped locator (within equivalent)
const { locator } = await render(<Component />);
await locator.getByRole("button").click();

// or use page.elementLocator for raw DOM scoping
import { page } from "vitest/browser";
const panel = screen.getByRole("tabpanel").element();
page.elementLocator(panel).getByRole("button").click();
```

### Checking element absence

```tsx
// .query() returns element or null (no throw)
const el = screen.getByText("gone").query();
expect(el).toBeNull();

// or negative assertion with auto-retry
await expect.element(screen.getByText("gone")).not.toBeInTheDocument();
```

## Interactions

Call methods **directly on locators**. No `userEvent.setup()` needed.

```tsx
await screen.getByRole("button", { name: /submit/i }).click();
await screen.getByPlaceholder(/amount/i).fill("100");
await screen.getByRole("combobox").clear();
await screen.getByRole("option", { name: /usd/i }).click();
```

Available locator methods: `click()`, `dblClick()`, `tripleClick()`, `fill(text)`, `clear()`, `hover()`, `unhover()`, `selectOptions(values)`, `dropTo(target)`.

For **keyboard input** or special keys, use `userEvent` from vitest:

```tsx
import { userEvent } from "vitest/browser";

await userEvent.keyboard("{Enter}");
await userEvent.tab();
await userEvent.type(element, "text{Enter}");
```

### fill vs type

- `fill(text)` — fast, replaces input value. Use by default.
- `userEvent.type(element, text)` — slow, simulates keystrokes. Use only when you need special key syntax like `{Enter}`, `{Backspace}`, `{Shift}`.

### Combobox pattern

Browser mode treats combobox as non-editable — `clear()` throws. Use click + backspace loop:

```tsx
const combo = screen.getByRole("combobox");
await combo.click();
const val = combo.query()?.getAttribute("value") ?? "";
for (let i = 0; i < val.length; i++) {
  await userEvent.keyboard("{Backspace}");
}
```

### Base UI dialog/modal overlay blocking clicks

Base UI adds `<div data-base-ui-inert="">` overlay that Playwright detects as intercepting pointer events. For buttons/links inside dialogs, use native DOM click with `as HTMLElement` cast (`.element()` returns `SVGElement | HTMLElement`):

```tsx
// playwright click blocked by overlay:
await screen.getByRole("button", { name: /proceed/i }).click(); // TimeoutError!

// fix: native DOM click bypasses actionability checks
(screen.getByRole("button", { name: /proceed/i }).element() as HTMLElement).click();
```

### Raw DOM access from locators

Locators are not DOM elements. `.element()` returns `SVGElement | HTMLElement` — cast to `HTMLElement` when accessing HTML-specific properties like `.click()`, `.textContent`, `.closest()`, etc.

```tsx
// get raw DOM node — cast when needed
const el = screen.getByRole("button", { name: /save/i }).element() as HTMLElement;
el.parentElement?.querySelector("span");

// async — wrap in vi.waitFor if element may not exist yet
await vi.waitFor(() => {
  const el = screen.getByRole("link", { name: /edit/i }).element();
  expect(el.getAttribute("href")).toContain("/edit");
});
```

## Assertions

Use `expect.element()` for **auto-retrying** DOM assertions. It polls until the condition passes or timeout.

```tsx
await expect.element(screen.getByText("Hello")).toBeVisible();
await expect.element(screen.getByRole("button")).toBeDisabled();
await expect.element(screen.getByRole("radio", { name: /monthly/i })).toBeChecked();
await expect.element(screen.getByRole("combobox")).toHaveValue("USD");
await expect.element(screen.getByPlaceholder(/amount/i)).toHaveValue("");
await expect.element(screen.getByText("gone")).not.toBeInTheDocument();
```

Custom timeout/interval:

```tsx
await expect.element(screen.getByText("slow"), { timeout: 5000 }).toBeVisible();
```

Available matchers: `toBeVisible()`, `toBeInTheDocument()`, `toHaveTextContent()`, `toHaveAttribute()`, `toHaveClass()`, `toHaveStyle()`, `toBeDisabled()`, `toBeEnabled()`, `toBeChecked()`, `toHaveValue()`, `toHaveDisplayValue()`, `toHaveFocus()`, `toContainHTML()`.

### When to use `vi.waitFor` instead

`expect.element` only works with locators. For non-locator assertions (DOM queries, counts, spy checks):

```tsx
await vi.waitFor(() =>
  expect(screen.container.querySelectorAll('[data-testid="item"]').length).toBe(4)
);

await vi.waitFor(() =>
  expect(don_set_mock).toHaveBeenCalledOnce()
);
```

### No findBy, no waitFor for elements

**Never use `findBy*`** — locators + `expect.element` replace them entirely.
**Never use `waitFor(() => getBy*())`** — `expect.element(getBy*()).toBeVisible()` does the same with auto-retry.

## Route-Aware Rendering

Components using `useLoaderData`, `useActionData`, or route hooks need `createRoutesStub`.

```tsx
import { createRoutesStub } from "react-router";

const Stub = createRoutesStub([
  {
    path: "/register/:regId",
    children: [
      {
        path: "1",
        Component: ContactDetails,
        loader: () => mock_data,
        action: update_action("2"),
      },
      { path: "2", Component: () => <div data-testid="step-2" /> },
    ],
  },
]);
const screen = await render(<Stub initialEntries={[`/register/${id}/1`]} />);
```

### Middleware context

```tsx
const Stub = createRoutesStub([{
  path: "/admin/:id/edit",
  Component: EditPage,
  loader,
  action,
  middleware: [
    async ({ context }, next) => {
      context.set(admin_ctx, npo_id);
      return next();
    },
  ],
}]);

const screen = await render(
  <Stub
    initialEntries={[`/admin/${id}/edit`]}
    future={{ v8_middleware: true }}
  />
);
```

## Module Mocking

Use `vi.hoisted()` for mutable mock values referenced by `vi.mock()`.

```tsx
const setter_mock = vi.hoisted(() => vi.fn());
const state_mock = vi.hoisted(() => ({ value: {} }));

vi.mock("../../context", () => ({
  use_hook: vi.fn().mockImplementation(() => ({
    state: state_mock.value,
    setter: setter_mock,
  })),
}));

// mutate before render
state_mock.value = { /* new state */ };
const screen = await render(<Component />);
```

### DB mock (integration tests)

Proxy-based mock defers property access until `beforeAll` creates the PGLite instance:

```tsx
import type { TestDb } from "$/pg/test-utils/pglite-browser";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("$/pg/db", () => {
  return {
    db: new Proxy({} as any, {
      get(_, prop) { return test_db.current!.db[prop]; },
    }),
  };
});

beforeAll(async () => {
  const { create_test_db } = await import("$/pg/test-utils/pglite-browser");
  test_db.current = await create_test_db();
});
```

### Queue mock (integration tests)

Files importing `$/kit/queue` transitively read `process.env` (via `$/env`). The polyfill in `setup-tests-browser.ts` populates `globalThis.process.env` from `import.meta.env` so module-load `process.env.X` reads work in chromium; the test-writer typically still mocks the queue itself to assert enqueued payloads:

```tsx
vi.mock("$/kit/queue", () => ({
  queue: { enqueue: vi.fn() },
}));
```

## MSW in Browser Mode

Global handlers in `src/setup-tests-browser.ts` via `setupWorker` (not `setupServer`).

```tsx
import { mswWorker } from "#/setup-tests-browser";

// override per-test (note: mswWorker.use() is unreliable in browser mode)
// prefer fetch spies or hook mocks for per-test overrides:
vi.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
  Promise.resolve(Response.json({ error: "slug taken" }, { status: 400 }))
);
```

### QStash event capture

```tsx
import { clear_qstash_events, get_qstash_events } from "#/setup-tests-browser";

// assert queue jobs fired
const events = get_qstash_events();
expect(events).toContainEqual(
  expect.objectContaining({ id: "process-donation" })
);
```

## Integration Test Principles

**Assert via UI, not DB.** The rendered page IS the proof. Direct DB queries are redundant.

**After submit**: wait for loader revalidation:
```tsx
await expect.element(screen.getByDisplayValue("New tagline")).toBeVisible();
await vi.waitFor(() =>
  expect(screen.getByRole("button", { name: /submit/i }).element()).toBeDisabled()
);
```

**Cross-page verification**: use `cleanup` from `vitest-browser-react`, render the consumer page, assert updated values:
```tsx
import { cleanup, render } from "vitest-browser-react";

// after asserting page A...
await cleanup();
const screen2 = await render(<PageB />);
await expect.element(screen2.getByText("updated")).toBeVisible();
```

## Test Structure: User Flows Over Render Tests

**Before writing any test, exhaust the user flow edge cases.** Map every path: happy path, validation failures, cross-role interactions. Write tests for flows — not isolated renders.

**Never write standalone "renders X" tests.** Every assertion belongs inside a user-flow test. Fold render assertions into the flow: assert structure before acting, assert updates after.

```tsx
// RIGHT: one flow that covers render + interaction
it("user sees balance, transfers, balances update", async () => {
  /* seed, render, assert structure + $1,000, click Transfer,
     fill amount, submit, assert $500 savings + $500 investments */
});
```

**Cross-page flows are highest-value.** Act on page A, `screen.unmount()`, render page B, assert.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `render(<C />)` without `await` | `const screen = await render(<C />)` |
| global `screen` import | use `screen` from `await render()` return value |
| `getAllByRole` / `getAllByText` | no `getAllBy*` — use `getByRole(...).nth(0)`, `.all()`, `.elements()` |
| `getByText("tip")` matches "Tips" too | add `{ exact: true }` for ambiguous short strings |
| `userEvent.setup()` + `user.click()` | `locator.click()` directly on the locator |
| `findByRole` / `findByText` | `getByRole` + `expect.element().toBeVisible()` |
| `waitFor(() => getBy*())` | `await expect.element(getBy*()).toBeVisible()` |
| `expect(el).toBeInTheDocument()` | `await expect.element(locator).toBeInTheDocument()` |
| `user.type(input, "text")` | `input.fill("text")` (use `type` only for special keys) |
| `user.clear(combobox)` | click + backspace loop (browser treats combobox as non-editable) |
| `screen.unmount()` between renders | `await cleanup()` from `vitest-browser-react` — `unmount` leaves stale container divs |
| click inside Base UI dialog times out | `(locator.element() as HTMLElement).click()` — native DOM click bypasses `data-base-ui-inert` overlay |
| `.parentElement` on a locator | `(locator.element() as HTMLElement).parentElement` — `.element()` returns `SVGElement \| HTMLElement`, cast when needed |
| `.element().click()` TS error | `.element()` returns `SVGElement \| HTMLElement`; cast to `HTMLElement` for `.click()`, `.closest()`, etc. |
| `.not.toBeInTheDocument({ timeout })` | `toBeInTheDocument()` accepts 0 args — put timeout on `expect.element(loc, { timeout })` instead |
| `.map(fn)` on `.elements()` type error | `.elements()` returns `(SVGElement \| HTMLElement)[]` — widen callback param to `Element` or cast |
| `mswWorker.use()` for per-test overrides | `vi.spyOn(globalThis, "fetch")` or mock hooks directly |
| querying DB directly after submit | assert via revalidated UI |
| `import "node:crypto"` / `Buffer` | `globalThis.crypto.randomUUID()` / `btoa()`/`atob()` |
