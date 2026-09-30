// Turning a phone photo of a page upright, in the browser.
// Four small rotations go to detect-rotation; the answer is applied here, so the
// full photo only leaves the phone once, already upright, for reading.
import { callFunction } from "./supabase";

const ROTATIONS = [0, 90, 180, 270] as const;
const PREVIEW_EDGE = 700;
const READ_EDGE = 2576; // Claude's full-resolution limit

function drawRotated(bitmap: ImageBitmap, degrees: number, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const sideways = degrees === 90 || degrees === 270;
  const canvas = document.createElement("canvas");
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  return canvas;
}

const toBase64 = (canvas: HTMLCanvasElement, quality: number) => canvas.toDataURL("image/jpeg", quality).split(",")[1];

export type UprightPhoto = {
  /** base64 JPEG, upright, ready for explain-page / read-contents */
  base64: string;
  /** object URL for showing the photo next to the cards; revoke when done */
  previewUrl: string;
  rotation: number;
};

export async function makeUpright(file: File, maxEdge = READ_EDGE): Promise<UprightPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const candidates = ROTATIONS.map((d) => toBase64(drawRotated(bitmap, d, PREVIEW_EDGE), 0.8));
    const { rotation } = await callFunction<{ rotation: number }>("detect-rotation", { candidates });
    const canvas = drawRotated(bitmap, rotation, maxEdge);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process the photo"))), "image/jpeg", 0.9),
    );
    return { base64: toBase64(canvas, 0.9), previewUrl: URL.createObjectURL(blob), rotation };
  } finally {
    bitmap.close();
  }
}
