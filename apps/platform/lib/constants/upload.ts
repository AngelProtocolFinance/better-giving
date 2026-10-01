/** what `/api/file-upload` stores: each accepted type, with the extensions
 * that stand in for it when the browser reports no type */
export const upload_limits = {
  types: {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "image/svg+xml": [".svg"],
    "application/pdf": [".pdf"],
  } as Record<string, readonly string[]>,
  /** MiB, so a client limit of 6 MB in either convention fits under it */
  max_bytes: 6 * 1024 * 1024,
};
