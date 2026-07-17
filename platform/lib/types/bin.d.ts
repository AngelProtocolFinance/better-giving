// `?bin` suffix is resolved by the `inline-binary` vite plugin to a base64
// string at build time. consumers decode with Buffer.from(value, "base64").
declare module "*?bin" {
  const value: string;
  export default value;
}
