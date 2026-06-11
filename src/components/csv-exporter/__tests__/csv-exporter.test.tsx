import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { CsvExporter } from "../csv-exporter";

describe("CsvExporter tests", () => {
  test("downloads the file with provided name", async () => {
    const headers = [
      { key: "key1", label: "Key1" },
      { key: "key2", label: "Key2" },
    ];
    const data = [
      { key1: "value11", key2: "value12" },
      { key1: "value21", key2: "value22" },
    ];
    const filename = "testfile.csv";

    const click_spy = vi.fn();
    const original_create = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        return {
          click: click_spy,
          href: "",
          download: "",
        } as unknown as HTMLAnchorElement;
      }
      return original_create(tag);
    });
    const create_url = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock");
    const revoke_url = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

    const screen = await render(
      <CsvExporter data={data} headers={headers} filename={filename}>
        Save
      </CsvExporter>
    );

    await screen.getByText("Save").click();

    expect(click_spy).toHaveBeenCalled();
    expect(create_url).toHaveBeenCalledWith(expect.any(Blob));
    expect(revoke_url).toHaveBeenCalledWith("blob:mock");
  });
});
