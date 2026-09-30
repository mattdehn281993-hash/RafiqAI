// Editors only (checked in the database functions):
// POST { action: "correct", card_id, changes, reason, report_id? } → { version }
// POST { action: "dismiss", report_id }                           → { ok: true }
import * as z from "zod";
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
]);

Deno.serve(handle(async (req, ctx) => {
  const input = await body(req, (raw) => Body.parse(raw));

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
