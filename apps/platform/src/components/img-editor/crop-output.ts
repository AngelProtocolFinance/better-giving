import { upload_limits } from "@/constants/upload";

const OUTPUT_SIZES: Record<string, [number, number]> = {
  "1/1": [315, 315],
  "2/1": [792, 396],
  "4/1": [1584, 396],
};

export function get_output_size(aspect: [number, number]): [number, number] {
  return (
    OUTPUT_SIZES[`${aspect[0]}/${aspect[1]}`] ?? [
      aspect[0] * 396,
      aspect[1] * 396,
    ]
  );
}

/** canvas can re-encode these. svg (and anything else) becomes a png raster. */
export function raster_mime(input_type: string): string {
  if (
    input_type === "image/jpeg" ||
    input_type === "image/png" ||
    input_type === "image/webp"
  ) {
    return input_type;
  }
  return "image/png";
}

/** keep an extension the upload route already accepts for this mime. */
export function name_for(original: string, mime: string): string {
  const allowed = upload_limits.types[mime] ?? [".png"];
  const slash = Math.max(original.lastIndexOf("/"), original.lastIndexOf("\\"));
  const base = (slash >= 0 ? original.slice(slash + 1) : original).replace(
    /^\.+/,
    ""
  );
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base) || "image";
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : "";
  const next = allowed.includes(ext) ? ext : (allowed[0] ?? ".png");
  return `${stem}${next}`;
}

export function file_from_crop(blob: Blob, original_name: string): File {
  const mime = (blob.type || "image/png").split(";")[0]!.trim().toLowerCase();
  return new File([blob], name_for(original_name, mime), { type: mime });
}

interface IPaintCrop {
  viewport: { width: number; height: number };
  crop: { x: number; y: number; width: number; height: number };
  zoom: number;
  offset: { x: number; y: number };
  rotation: number;
  flip_x: boolean;
  flip_y: boolean;
  out_w: number;
  out_h: number;
  /** the cropper's ground, so letterbox matches the preview */
  background: string;
}

/**
 * paint the crop window the way the preview shows it.
 *
 * the photo is `object-contain` in the viewport: one scale for both axes,
 * centered. sampling that window with a different x and y scale (what a plain
 * `drawImage` into the output rectangle does) squashes a photo that is not
 * already the target ratio. this draws that same contained photo, then scales
 * the crop window uniformly onto the output size.
 */
export function paint_crop(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  natural: { width: number; height: number },
  geom: IPaintCrop
) {
  const {
    viewport,
    crop,
    zoom,
    offset,
    rotation,
    flip_x,
    flip_y,
    out_w,
    out_h,
    background,
  } = geom;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out_w, out_h);

  const fit = Math.min(
    viewport.width / natural.width,
    viewport.height / natural.height
  );
  if (!Number.isFinite(fit) || fit <= 0) return;
  const drawn_w = natural.width * fit;
  const drawn_h = natural.height * fit;
  const img_x = (viewport.width - drawn_w) / 2;
  const img_y = (viewport.height - drawn_h) / 2;

  const scale = Math.min(out_w / crop.width, out_h / crop.height);
  if (!Number.isFinite(scale) || scale <= 0) return;
  const dest_w = crop.width * scale;
  const dest_h = crop.height * scale;
  const dest_x = (out_w - dest_w) / 2;
  const dest_y = (out_h - dest_h) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(dest_x, dest_y, dest_w, dest_h);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.translate(dest_x, dest_y);
  ctx.scale(scale, scale);
  ctx.translate(-crop.x, -crop.y);

  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const z = zoom > 0 ? zoom : 1;
  ctx.translate(cx + offset.x, cy + offset.y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(z * (flip_x ? -1 : 1), z * (flip_y ? -1 : 1));
  ctx.translate(-cx, -cy);
  ctx.drawImage(image, img_x, img_y, drawn_w, drawn_h);
  ctx.restore();
}

function to_blob(
  canvas: HTMLCanvasElement,
  type: string
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, 0.92);
  });
}

/** encode as `mime` when the browser can; otherwise png, whose type is on the blob. */
export async function encode_canvas(
  canvas: HTMLCanvasElement,
  mime: string
): Promise<Blob | null> {
  const blob = await to_blob(canvas, mime);
  if (blob) return blob;
  if (mime === "image/png") return null;
  return to_blob(canvas, "image/png");
}
