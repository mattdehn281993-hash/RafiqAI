// Photo preparation shared by the page and contents spikes.
import type Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { detectRotation, ROTATIONS, type Degrees } from "../../shared/orientation.ts";

const MAX_EDGE = 2576; // Claude Opus 5's full-resolution limit; larger images get downscaled anyway

/** Turn the page upright, cap the long edge, re-encode as high-quality JPEG. */
export async function prepareImage(client: Anthropic, file: string, detect = true) {
  // EXIF orientation first, then work out how the page itself is turned.
  const oriented = await sharp(file).rotate().toBuffer();
  let rotation: Degrees = 0;
  if (detect) {
    const small = await sharp(oriented).resize({ width: 700, height: 700, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
    const candidates = await Promise.all(ROTATIONS.map((d) => sharp(small).rotate(d).jpeg({ quality: 80 }).toBuffer()));
    rotation = await detectRotation(client, candidates);
  }
  const { data, info } = await sharp(oriented)
    .rotate(rotation)
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height, rotation };
}
