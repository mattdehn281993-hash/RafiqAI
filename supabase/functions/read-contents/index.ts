// POST { images: [b64, …] } → { map, … }: the Book Map for the student to check.
// Images are the title page and contents pages, upright, in page order. Nothing is saved.
import * as z from "zod";
import { readContents } from "../_shared/read-contents.ts";
import { anthropic } from "../_edge/anthropic.ts";
import { body, handle, json } from "../_edge/http.ts";

const Body = z.object({ images: z.array(z.string().min(1000).max(8_000_000)).min(1).max(6) });

Deno.serve(handle(async (req) => {
  const { images } = await body(req, (raw) => Body.parse(raw));
  // Low effort: identical map to high on the real book (62/62 rows) in 64 s instead
  // of 143 s, well inside the free plan's 150 s function limit.
  const result = await readContents(anthropic(), images, { effort: "low" });
  return json(result);
}));
