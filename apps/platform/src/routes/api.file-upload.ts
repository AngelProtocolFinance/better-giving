import { put } from "@vercel/blob";
import { type ActionFunction, data } from "react-router";
import { nonEmpty, pipe, safeParse, string } from "valibot";
import { get_session } from "#/.server/auth";
import { upload_limits } from "@/constants/upload";
import { resp, search } from "@/helpers/https";
import { blob as blob_env } from "$/env";

/** where user uploads live. The build mirrors content-hashed client assets into
 * the same blob store under `assets/` (`utils/upload-client-assets.ts`), and
 * the app's html points at them, so an upload that could pick its own pathname
 * could replace a live js chunk. One prefix, applied here, keeps the two sets
 * from ever addressing the same object. */
const PREFIX = "u/";

/** the caller names the file, so treat it as a name and not a path: no
 * traversal, no separators, no leading dot. */
const basename = (raw: string): string =>
  raw.split(/[/\\]/).pop()!.replace(/^\.+/, "").slice(0, 200);

/** a browser that can't sniff a file posts it untyped, and the client sends
 * no content-type of its own — the dropzone accepted it by extension, so the
 * extension is what's left to go on. */
const type_of = (file: Blob, name: string): string | undefined => {
  if (file.type) {
    return Object.hasOwn(upload_limits.types, file.type)
      ? file.type
      : undefined;
  }
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return Object.entries(upload_limits.types).find(([, exts]) =>
    exts.includes(ext)
  )?.[0];
};

export const action: ActionFunction = async ({ request }) => {
  // every surface that uploads is signed in — the img editor, the bank
  // statement field, and the fsa step. nothing else guards this route: it has
  // no parent layout.
  const { user } = await get_session(request);
  if (!user) return resp.fail(401, "Sign in to continue");

  const { filename } = search(request);
  const p = safeParse(pipe(string(), nonEmpty()), filename);
  if (p.issues) return resp.status(400, p.issues[0].message);

  const name = basename(p.output);
  if (!name) return resp.status(400, "invalid filename");

  const file = await request.blob();
  const type = type_of(file, name);
  if (!type) return resp.status(415, "unsupported file type");
  if (file.size > upload_limits.max_bytes) {
    return resp.status(413, "file too large");
  }

  const blob = await put(`${PREFIX}${name}`, file, {
    access: "public",
    // otherwise put derives it from the name's extension, not the checked type
    contentType: type,
    // the two together are what stop one upload from overwriting another's —
    // the caller's filename is not unique and is not ours to trust
    addRandomSuffix: true,
    allowOverwrite: false,
    token: blob_env.read_write_token,
  });

  return data({ url: blob.url });
};
