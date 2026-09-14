import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TabPanel, Tabs } from "./tabs";

const items = [
  { value: "profile", label: "Profile" },
  { value: "donation", label: "Donation Page" },
  { value: "fundraiser", label: "Fundraiser" },
];

function Subject() {
  return (
    <Tabs items={items} defaultValue="profile">
      {items.map((it) => (
        <TabPanel key={it.value} value={it.value}>
          {it.label} panel
        </TabPanel>
      ))}
    </Tabs>
  );
}

describe("Tabs", () => {
  test("clicking a trigger selects it and shows its panel", async () => {
    const screen = await render(<Subject />);
    await expect
      .element(screen.getByRole("tabpanel"))
      .toHaveTextContent("Profile panel");

    await screen.getByRole("tab", { name: "Donation Page" }).click();

    await expect
      .element(screen.getByRole("tab", { name: "Donation Page" }))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(screen.getByRole("tabpanel"))
      .toHaveTextContent("Donation Page panel");
  });

  test("arrow keys move the selection", async () => {
    const screen = await render(<Subject />);
    await screen.getByRole("tab", { name: "Profile" }).click();

    await userEvent.keyboard("{ArrowRight}");
    await expect
      .element(screen.getByRole("tab", { name: "Donation Page" }))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(screen.getByRole("tab", { name: "Profile" }))
      .toHaveAttribute("aria-selected", "false");

    await userEvent.keyboard("{ArrowLeft}");
    await expect
      .element(screen.getByRole("tab", { name: "Profile" }))
      .toHaveAttribute("aria-selected", "true");

    // loops from the first trigger back to the last
    await userEvent.keyboard("{ArrowLeft}");
    await expect
      .element(screen.getByRole("tab", { name: "Fundraiser" }))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(screen.getByRole("tabpanel"))
      .toHaveTextContent("Fundraiser panel");
  });

  test("controlled value reports the chosen item's value", async () => {
    const seen: string[] = [];
    const screen = await render(
      <Tabs items={items} value="profile" onValueChange={(v) => seen.push(v)}>
        <TabPanel value="profile">Profile panel</TabPanel>
      </Tabs>
    );
    await screen.getByRole("tab", { name: "Fundraiser" }).click();
    expect(seen).toEqual(["fundraiser"]);
  });
});
