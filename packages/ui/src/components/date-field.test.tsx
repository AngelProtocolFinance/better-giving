import { useState } from "react";
import { renderToString } from "react-dom/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { DateField } from "./date-field";

// 2026-03-15 03:00 UTC is 2026-03-14 20:00 in los angeles (PDT, UTC−7):
// the viewer's today is a day behind the UTC date.
const NOW = new Date("2026-03-15T03:00:00Z");
const ZONE = "America/Los_Angeles";

// en-US segment order: month, day, year. each segment is clicked and settled
// on its own — typing straight through races the auto-advance.
async function typeDate(
  month: string,
  day: string,
  year: string,
  bound: "minToday" | "maxToday" = "minToday"
) {
  const changes: string[] = [];
  function Host() {
    const [value, setValue] = useState("");
    return (
      <DateField
        name="expiration"
        label="End date"
        value={value}
        onChange={(v) => {
          changes.push(v);
          setValue(v);
        }}
        {...{ [bound]: true }}
      />
    );
  }
  const screen = await render(<Host />);
  const segments = screen.getByRole("spinbutton");
  const fill = async (index: number, digits: string) => {
    await segments.nth(index).click();
    await userEvent.keyboard(digits);
  };
  // the day goes last, so the date only completes (and clamps) on it
  await fill(2, year);
  await expect.element(segments.nth(2)).toHaveTextContent(year);
  await fill(0, month);
  await expect.element(segments.nth(0)).toHaveTextContent(String(+month));
  await fill(1, day);
  await userEvent.tab();
  const shown = () =>
    segments
      .elements()
      .map((el) => el.textContent)
      .join("/");
  return { changes, shown };
}

describe("DateField minToday", () => {
  beforeAll(async () => {
    await cdp().send("Emulation.setTimezoneOverride", { timezoneId: ZONE });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setTimezoneOverride", { timezoneId: "" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("the zone override reaches the page", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(ZONE);
    expect(NOW.getDate()).toBe(14);
  });

  test("keeps the viewer's local today when the UTC date is already tomorrow", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { changes, shown } = await typeDate("03", "14", "2026");
    await expect.poll(shown).toBe("3/14/2026");
    expect(changes.at(-1)).toBe("2026-03-14");
  });

  test("still clamps a date before the viewer's today up to it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { shown } = await typeDate("03", "13", "2026");
    await expect.poll(shown).toBe("3/14/2026");
  });
});

// 2026-03-14 20:00 UTC is 2026-03-15 05:00 in tokyo (JST, UTC+9):
// the viewer's today is a day ahead of the UTC date.
const EAST_NOW = new Date("2026-03-14T20:00:00Z");
const EAST_ZONE = "Asia/Tokyo";

describe("DateField maxToday", () => {
  beforeAll(async () => {
    await cdp().send("Emulation.setTimezoneOverride", {
      timezoneId: EAST_ZONE,
    });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setTimezoneOverride", { timezoneId: "" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("the zone override reaches the page", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(EAST_ZONE);
    expect(EAST_NOW.getDate()).toBe(15);
  });

  test("allows the viewer's local today when the UTC date is still yesterday", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(EAST_NOW);
    const { changes, shown } = await typeDate("03", "15", "2026", "maxToday");
    await expect.poll(shown).toBe("3/15/2026");
    expect(changes.at(-1)).toBe("2026-03-15");
  });
});

function server_shown(node: React.ReactElement) {
  const doc = new DOMParser().parseFromString(
    renderToString(node),
    "text/html"
  );
  return [...doc.querySelectorAll('[role="spinbutton"]')]
    .map((el) => el.textContent)
    .join("/");
}

// a server render has no viewer zone, so each bound falls back to the most
// permissive today on earth: UTC−12 for a lower bound, UTC+14 for an upper one.
describe("DateField server render", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
  };
  const field = (
    value: string,
    props: { minToday?: boolean; maxToday?: boolean }
  ) => server_shown(<DateField value={value} onChange={() => {}} {...props} />);

  // 11:30Z is 03-13 23:30 in UTC−12 but already 03-14 00:30 in UTC−11
  test("minToday keeps a date that is today only in UTC−12", () => {
    at("2026-03-14T11:30:00Z");
    expect(field("2026-03-13", { minToday: true })).toBe("3/13/2026");
  });

  test("minToday clamps a date before UTC−12's today up to it", () => {
    at("2026-03-14T11:30:00Z");
    expect(field("2026-03-12", { minToday: true })).toBe("3/13/2026");
  });

  // 10:30Z is 03-15 00:30 in UTC+14 but still 03-14 23:30 in UTC+13
  test("maxToday keeps a date that is today only in UTC+14", () => {
    at("2026-03-14T10:30:00Z");
    expect(field("2026-03-15", { maxToday: true })).toBe("3/15/2026");
  });

  test("maxToday clamps a date past UTC+14's today down to it", () => {
    at("2026-03-14T10:30:00Z");
    expect(field("2026-03-16", { maxToday: true })).toBe("3/15/2026");
  });

  test("without minToday a past date is left alone", () => {
    at("2026-03-14T11:30:00Z");
    expect(field("2026-03-12", {})).toBe("3/12/2026");
  });
});
