import { beforeEach, describe, expect, test, vi } from "vitest";

const put = vi.hoisted(() => vi.fn());
vi.mock("@vercel/blob", () => ({ put }));
vi.mock("#/.server/auth", () => ({
  get_session: async () => ({ user: { id: "u1" } }),
}));
vi.mock("$/env", () => ({ blob: { read_write_token: "tok" } }));

import { action } from "./api.file-upload";

const upload = (body: Blob, filename = "photo.png") =>
  action({
    request: new Request(
      `https://bg.test/api/file-upload?filename=${filename}`,
      { method: "POST", body }
    ),
  } as any) as Promise<any>;

beforeEach(() => {
  put.mockReset();
  put.mockResolvedValue({ url: "https://blob.test/u/photo-abc.png" });
});

describe("file upload", () => {
  test("refuses a type no uploader accepts, storing nothing", async () => {
    const res: Response = await upload(
      new Blob(["<script>"], { type: "text/html" }),
      "page.html"
    );
    expect(res.status).toBe(415);
    expect(put).not.toHaveBeenCalled();
  });

  test("refuses a file past 6 MiB, storing nothing", async () => {
    const res: Response = await upload(
      new Blob([new Uint8Array(6 * 1024 * 1024 + 1)], { type: "image/png" })
    );
    expect(res.status).toBe(413);
    expect(put).not.toHaveBeenCalled();
  });

  test("stores an accepted file under the type that was checked", async () => {
    const res = await upload(
      new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "application/pdf" }),
      "statement.pdf"
    );
    expect(res.data).toEqual({ url: "https://blob.test/u/photo-abc.png" });
    const [path, , opts] = put.mock.calls[0]!;
    expect(path).toBe("u/statement.pdf");
    expect(opts).toMatchObject({ contentType: "application/pdf" });
  });

  test("types an untyped file by its extension when it is one we accept", async () => {
    await upload(new Blob(["%PDF-1.7"]), "statement.PDF");
    expect(put.mock.calls[0]![2]).toMatchObject({
      contentType: "application/pdf",
    });
  });

  test("refuses an untyped file whose extension we don't accept", async () => {
    const res: Response = await upload(new Blob(["<script>"]), "x.html");
    expect(res.status).toBe(415);
    expect(put).not.toHaveBeenCalled();
  });
});
