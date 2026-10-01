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

const bytes = (...xs: number[]) => new Uint8Array(xs);
const HTML = "<!doctype html><script>alert(1)</script>";

/** the smallest real opening of each accepted format */
const SIGNED: [string, string, BlobPart[]][] = [
  ["image/jpeg", "a.jpg", [bytes(0xff, 0xd8, 0xff, 0xe0)]],
  [
    "image/png",
    "a.png",
    [bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
  ],
  ["image/webp", "a.webp", ["RIFF", bytes(1, 2, 3, 4), "WEBPVP8 "]],
  ["application/pdf", "a.pdf", ["%PDF-1.7\n"]],
  [
    "image/svg+xml",
    "a.svg",
    [
      '\uFEFF <?xml version="1.0"?>\n<!-- logo -->\n<!DOCTYPE svg>\n<svg xmlns="http://www.w3.org/2000/svg"/>',
    ],
  ],
];

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
      new Blob(["%PDF-1.7\n", new Uint8Array(6 * 1024 * 1024 - 9)], {
        type: "application/pdf",
      }),
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

  test.each(SIGNED)(
    "stores real %s bytes under that type",
    async (type, name, parts) => {
      const res = await upload(new Blob(parts, { type }), name);
      expect(res.data).toEqual({ url: "https://blob.test/u/photo-abc.png" });
      expect(put.mock.calls[0]![2]).toMatchObject({ contentType: type });
    }
  );

  test("refuses html bytes declared as an image", async () => {
    const res: Response = await upload(
      new Blob([HTML], { type: "image/png" }),
      "x.png"
    );
    expect(res.status).toBe(415);
    expect(put).not.toHaveBeenCalled();
  });

  test("refuses html bytes named as a pdf with no declared type", async () => {
    const res: Response = await upload(new Blob([HTML]), "x.pdf");
    expect(res.status).toBe(415);
    expect(put).not.toHaveBeenCalled();
  });

  test("refuses one accepted format declared as another", async () => {
    const res: Response = await upload(
      new Blob(["%PDF-1.7\n"], { type: "image/png" }),
      "x.png"
    );
    expect(res.status).toBe(415);
  });

  test("refuses html that only mentions an svg", async () => {
    const res: Response = await upload(
      new Blob(["<html><svg/></html>"], { type: "image/svg+xml" }),
      "x.svg"
    );
    expect(res.status).toBe(415);
  });
});
