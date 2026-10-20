import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { loader } from "./[llms.txt]";

const guide = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../public/llm.txt"),
  "utf8"
);

describe("/llms.txt", () => {
  test("serves public/llm.txt as text/plain", async () => {
    const res = await loader({} as never);
    expect(res).toBeInstanceOf(Response);
    const response = res as Response;
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8"
    );
    expect(await response.text()).toBe(guide);
  });
});
