---
name: test-writer
description: "Use when writing, modifying, or reviewing component tests, integration tests, or route tests in the apps/platform React Router v7 web app. Triggers on *.test.tsx, *.test.ts files."
globs:
  - "apps/platform/{src,lib,.server}/**/*.test.tsx"
  - "apps/platform/{src,lib,.server}/**/*.test.ts"
---

# Test Writer — Vitest Browser Mode

**Jurisdiction: `apps/platform/`.** Every path in this skill is relative to `apps/platform/`; run the commands from there (`pnpm --filter platform exec …` from the repo root works too).

Tests run in **real headless Chromium** via `@vitest/browser` + Playwright. Render with `vitest-browser-react`. No jsdom, no happy-dom, no `@testing-library/*`.

Setup is **two** files: `src/setup-tests-browser.ts` (process.env polyfill, MSW worker, qstash capture) and `src/__tests__/mocks/payment.tsx` (global payment-provider mocks — where a stripe/paypal mock you didn't write comes from).
Config: `vite.config.ts` → `test.browser`. Env comes from `.env.test`.

Tests live under `src/`, `lib/` and `.server/` — 13 of them are outside `src/`.

## Running Tests

Always use `--bail 1` to fail fast on first error:

```bash
# from apps/platform/
pnpm vitest run --bail 1 src/path/to/test.test.tsx
```

Every test file imports `{ describe, expect, test, vi }` from `"vitest"` explicitly despite `globals: true` — line 1 of any new file.

`fileParallelism: false` and `testTimeout: 15_000` (`vite.config.ts`), so files run one at a time and a slow flow needs no custom timeout until it passes 15s. A **second concurrent vitest run dies** with `Port NNNNN is already in use` — pass `--browser.api.port=<free port>` when running one alongside another.

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

`clear()` then `fill()` works on the editable comboboxes here — `src/components/donation/donor-step.test.tsx:103-105` does exactly that against the country field:

```tsx
await screen.getByRole("combobox", { name: /country/i }).clear();
await screen.getByRole("combobox", { name: /country/i }).fill("Canada");
await screen.getByRole("option", { name: /canada/i }).click();
```

If a specific combobox is genuinely non-editable and `clear()` throws on it, fall back to click + backspace loop — and name that component here when you find one:

```tsx
const combo = screen.getByRole("combobox");
await combo.click();
const val = combo.query()?.getAttribute("value") ?? "";
for (let i = 0; i < val.length; i++) {
  await userEvent.keyboard("{Backspace}");
}
```

### Ark UI dialog Escape race

Ark UI's dismissable layer (zag-js) attaches its document-level `keydown` listener via a deferred `requestAnimationFrame`. A single `userEvent.keyboard("{Escape}")` fired right after render races that registration — flaky pass/fail. Retry the dispatch inside `vi.waitFor` until the modal actually unmounts:

```tsx
await vi.waitFor(() => {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
  );
  expect(document.body).not.toHaveTextContent("modal body");
});
```

### Dialog backdrop blocking clicks

Modals are **Ark UI** — `src/components/route-modal.tsx` renders `Dialog.Backdrop` as a `fixed inset-0 z-50` layer, which Playwright's actionability check reads as intercepting pointer events. (Several in-repo test comments call this a "base-ui inert overlay"; Base UI is not a dependency — the attribution is wrong, the technique is right.) For buttons/links inside dialogs, use native DOM click with an `as HTMLElement` cast (`.element()` returns `SVGElement | HTMLElement`):

```tsx
// playwright click blocked by the backdrop:
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

Proxy-based mock defers property access until `beforeAll` creates the PGLite instance. Paths below are for a test in `src/`; from a test **inside `.server/`** use the relative sibling path instead (`../pg/db`, `../pg/test-utils/pglite-browser`) — see `apps/platform/CLAUDE.md`.

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

`$/kit/queue` has **no `queue` export** — its exports are flat and named (`receiver`, `client`, `enqueue`, `schedule`, `don_dist`, `verify_qstash`). Mock the ones the SUT imports:

```tsx
vi.mock("$/kit/queue", () => ({ enqueue: vi.fn() }));

// a route that pulls the whole module needs the rest stubbed too
vi.mock("$/kit/queue", () => ({
  receiver: {},
  client: {},
  enqueue: vi.fn(),
  schedule: vi.fn(),
  don_dist: vi.fn(),
  verify_qstash: vi.fn(),
}));
```

## MSW in Browser Mode

Global handlers in `src/setup-tests-browser.ts` via `setupWorker` (not `setupServer`).

Override per test with `mswWorker.use(handler)` — `setup-tests-browser.ts:67-68` calls `resetHandlers()` in `afterEach`, so overrides don't leak:

```tsx
import { mswWorker } from "#/setup-tests-browser";

mswWorker.use(don_intents_error_handler);
```

Reach for a fetch spy only when the call bypasses MSW (`src/__tests__/registration.test.tsx:221` is the in-repo case):

```tsx
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

**Assert via UI, not DB** — in route/page integration tests, the rendered page IS the proof and a direct DB query is redundant. Query-level tests under `.server/pg/queries/` assert rows directly; that's their job.

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

**Cross-page flows are highest-value.** Act on page A, `await cleanup()`, render page B, assert.

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
| `user.clear(combobox)` | `combobox.clear()` then `.fill()` directly on the locator |
| `screen.unmount()` between renders | `await cleanup()` from `vitest-browser-react` — `unmount` leaves stale container divs |
| click inside an Ark UI dialog times out | `(locator.element() as HTMLElement).click()` — native DOM click bypasses the `Dialog.Backdrop` overlay |
| `.parentElement` on a locator | `(locator.element() as HTMLElement).parentElement` — `.element()` returns `SVGElement \| HTMLElement`, cast when needed |
| `.element().click()` TS error | `.element()` returns `SVGElement \| HTMLElement`; cast to `HTMLElement` for `.click()`, `.closest()`, etc. |
| `.not.toBeInTheDocument({ timeout })` | `toBeInTheDocument()` accepts 0 args — put timeout on `expect.element(loc, { timeout })` instead |
| `.map(fn)` on `.elements()` type error | `.elements()` returns `(SVGElement \| HTMLElement)[]` — widen callback param to `Element` or cast |
| `vi.mock("$/kit/queue", () => ({ queue: {…} }))` | no `queue` export — mock the flat named exports (`enqueue`, `don_dist`, …) |
| querying DB directly after a route submit | assert via revalidated UI (query-level tests under `.server/pg/queries/` are the exception) |
| `import "node:crypto"` / `Buffer` | `globalThis.crypto.randomUUID()` / `btoa()`/`atob()` |
