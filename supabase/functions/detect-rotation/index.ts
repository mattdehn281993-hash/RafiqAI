// POST { candidates: [b64, b64, b64, b64] }  → { rotation: 0 | 90 | 180 | 270 }
// candidates[i] is the photo rotated clockwise by 0/90/180/270, about 700px, as base64 JPEG.
import * as z from "zod";
import { detectRotation } from "../_shared/orientation.ts";
import { anthropic } from "../_edge/anthropic.ts";
import { body, handle, json } from "../_edge/http.ts";

const Body = z.object({ candidates: z.array(z.string().max(1_500_000)).length(4) });

Deno.serve(handle(async (req) => {
  const { candidates } = await body(req, (raw) => Body.parse(raw));
  const rotation = await detectRotation(anthropic(), candidates);
  return json({ rotation });
}));
