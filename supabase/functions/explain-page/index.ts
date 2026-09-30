// POST { class_id, image } → the page's cards as a draft, for the student to check.
// `image` is the upright page as base64 JPEG. Nothing is saved and the photo is
// not stored: the app keeps it until the student confirms, then calls save-page.
import * as z from "zod";
import { explainPage, ExplainPageError } from "../_shared/explain-page.ts";
import { anthropic } from "../_edge/anthropic.ts";
import { body, handle, HttpError, json, requireClass } from "../_edge/http.ts";

const Body = z.object({
  class_id: z.uuid(),
  image: z.string().min(1000).max(8_000_000),
});

Deno.serve(handle(async (req, ctx) => {
  const input = await body(req, (raw) => Body.parse(raw));
  const cls = await requireClass(ctx, input.class_id);

  let result;
  try {
    result = await explainPage(anthropic(), { base64: input.image, mediaType: "image/jpeg" });
  } catch (err) {
    if (err instanceof ExplainPageError) throw new HttpError(422, err.message);
    throw err;
  }

  // "A page is only ever snapped once": tell the app if this page is already saved.
  let existingPageId: string | null = null;
  const pageNumber = Number(result.extraction.page_number);
  if (Number.isInteger(pageNumber)) {
    const { data } = await ctx.userClient
      .from("pages")
      .select("id")
      .eq("book_id", cls.book_id)
      .eq("page_number", pageNumber)
      .maybeSingle();
    existingPageId = data?.id ?? null;
  }

  return json({ ...result, existing_page_id: existingPageId });
}));
