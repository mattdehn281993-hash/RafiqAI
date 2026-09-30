// POST { class_id, lesson_id, extraction, model, prompt_version } → { page_id }
// Saves a page the student has checked (and possibly corrected) as shared cards.
import * as z from "zod";
import { PageExtraction } from "../_shared/card-schema.ts";
import { body, handle, HttpError, json, requireClass } from "../_edge/http.ts";

const Body = z.object({
  class_id: z.uuid(),
  lesson_id: z.uuid().nullable(),
  extraction: PageExtraction,
  model: z.string().max(100),
  prompt_version: z.string().max(100),
});

Deno.serve(handle(async (req, ctx) => {
  const input = await body(req, (raw) => Body.parse(raw));
  const cls = await requireClass(ctx, input.class_id);

  const { data, error } = await ctx.admin.rpc("save_scanned_page", {
    p_user: ctx.user.id,
    p_book: cls.book_id,
    p_lesson: input.lesson_id,
    p_model: input.model,
    p_prompt_version: input.prompt_version,
    p_page: { ...input.extraction, page_number: toPageNumber(input.extraction.page_number) },
  });
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "This page has already been saved");
    if (/does not belong/.test(error.message)) throw new HttpError(400, error.message);
    throw error;
  }
  return json({ page_id: data });
}));

/** "12" → 12; anything that isn't a whole number is stored as no page number. */
function toPageNumber(value: string | null): number | null {
  const n = Number(value);
  return value !== null && Number.isInteger(n) && n > 0 ? n : null;
}
