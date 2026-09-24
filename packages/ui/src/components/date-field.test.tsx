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
async function typeDate(month: string, day: string, year: string) {
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
        minToday
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

  test("a server render keeps a date that is still today west of UTC", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const html = renderToString(
      <DateField value="2026-03-14" onChange={() => {}} minToday />
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const shown = [...doc.querySelectorAll('[role="spinbutton"]')]
      .map((el) => el.textContent)
      .join("/");
    expect(shown).toBe("3/14/2026");
  });
});
