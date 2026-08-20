//https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
type ImageSubType = "svg+xml" | "jpeg" | "png" | "webp";
type ApplicationSubType = "pdf";

export type ImageMIMEType = `image/${ImageSubType}`;
export type ApplicationMIMEType = `application/${ApplicationSubType}`;

export type MIMEType = ImageMIMEType | ApplicationMIMEType;
