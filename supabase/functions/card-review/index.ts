// Editors only (checked in the database functions):
// POST { action: "correct", card_id, changes, reason, report_id? } → { version }
// POST { action: "dismiss", report_id }                           → { ok: true }
// POST { action: "page", page_id, page_number, lesson_id }         → { ok: true }
// POST { action: "book_map", class_id, map }                       → { filed_pages }
import * as z from "zod";
import { BookMap } from "../_shared/read-contents.ts";
import { body, handle, HttpError, json } from "../_edge/http.ts";

const Changes = z
  .object({
    arabic_printed: z.string().min(1).max(2000),
    arabic_full: z.string().min(1).max(2000),
    tts_text: z.string().min(1).max(2000),
    pronunciation: z.string().min(1).max(2000),
    english: z.string().min(1).max(2000),
    sound_note: z.string().max(500).nullable(),
    needs_checking: z.boolean(),
    needs_checking_reason: z.string().max(500).nullable(),
  })
  .partial();

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("correct"),
    card_id: z.uuid(),
    changes: Changes,
    reason: z.string().max(500).default("correction"),
    report_id: z.uuid().nullable().optional(),
  }),
  z.object({ action: z.literal("dismiss"), report_id: z.uuid() }),
  z.object({
    action: z.literal("page"),
    page_id: z.uuid(),
    page_number: z.number().int().positive().max(2000).nullable(),
    lesson_id: z.uuid().nullable(),
  }),
  z.object({ action: z.literal("book_map"), class_id: z.uuid(), map: BookMap }),
]);

const editorError = (message: string) =>
  /Only editors/.test(message) ? new HttpError(403, message)
  : /already has|does not belong|No lessons/.test(message) ? new HttpError(400, message.replace("No lessons found in the Book Map", "No lessons were found in these photos. Add every contents page."))
  : /duplicate|unique/.test(message) ? new HttpError(409, "Another saved page already has that page number")
  : null;

Deno.serve(handle(async (req, ctx) => {
  const input = await body(req, (raw) => Body.parse(raw));

  if (input.action === "page") {
    const { error } = await ctx.admin.rpc("update_page_info", {
      p_user: ctx.user.id,
      p_page: input.page_id,
      p_page_number: input.page_number,
      p_lesson: input.lesson_id,
    });
    if (error) throw editorError(error.message) ?? error;
    return json({ ok: true });
  }

  if (input.action === "book_map") {
    const { data, error } = await ctx.admin.rpc("set_book_map", { p_user: ctx.user.id, p_class: input.class_id, p_map: input.map });
    if (error) throw editorError(error.message) ?? error;
    return json({ filed_pages: data });
  }

  if (input.action === "dismiss") {
    const { error } = await ctx.admin.rpc("dismiss_report", { p_user: ctx.user.id, p_report: input.report_id });
    if (error) throw /Only editors/.test(error.message) ? new HttpError(403, error.message) : error;
    return json({ ok: true });
  }

  if (Object.keys(input.changes).length === 0) throw new HttpError(400, "Nothing to change");
  const { data, error } = await ctx.admin.rpc("correct_card", {
    p_user: ctx.user.id,
    p_card: input.card_id,
    p_changes: input.changes,
    p_reason: input.reason,
    p_report: input.report_id ?? null,
  });
  if (error) throw /Only editors/.test(error.message) ? new HttpError(403, error.message) : error;
  return json({ version: data });
}));
