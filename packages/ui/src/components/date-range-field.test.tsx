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
import { DateRangeField } from "./date-range-field";

// 2026-03-14 20:00 UTC is 2026-03-15 05:00 in tokyo (JST, UTC+9):
// the viewer's today is a day ahead of the UTC date.
const NOW = new Date("2026-03-14T20:00:00Z");
const ZONE = "Asia/Tokyo";

// en-US segment order: month, day, year; the start group is spinbuttons 0–2.
// each segment is clicked and settled on its own — typing straight through
// races the auto-advance.
async function typeStart(month: string, day: string, year: string) {
  const changes: string[] = [];
  function Host() {
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    return (
      <DateRangeField
        startValue={start}
        endValue={end}
        onChange={(s, e) => {
          changes.push(s);
          setStart(s);
          setEnd(e);
        }}
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
      .slice(0, 3)
      .map((el) => el.textContent)
      .join("/");
  return { changes, shown };
}

describe("DateRangeField maxToday", () => {
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
    expect(NOW.getDate()).toBe(15);
  });

  test("allows the viewer's local today when the UTC date is still yesterday", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { changes, shown } = await typeStart("03", "15", "2026");
    await expect.poll(shown).toBe("3/15/2026");
    expect(changes.at(-1)).toBe("2026-03-15");
  });

  test("still clamps a date after the viewer's today down to it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { shown } = await typeStart("03", "16", "2026");
    await expect.poll(shown).toBe("3/15/2026");
  });

  test("a server render keeps a date that is already today east of UTC", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const html = renderToString(
      <DateRangeField
        startValue="2026-03-15"
        endValue="2026-03-15"
        onChange={() => {}}
      />
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const shown = [...doc.querySelectorAll('[role="spinbutton"]')]
      .map((el) => el.textContent)
      .join("/");
    expect(shown).toBe("3/15/2026/3/15/2026");
  });
});
