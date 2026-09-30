// Book Map: photos of the title page and table of contents in, ordered lesson list out.
import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { strictJsonSchema } from "./strict-schema.ts";

export const CONTENTS_PROMPT_VERSION = "2026-09-30.1";

export const Lesson = z.object({
  number_label: z.string().describe("The lesson's number as printed, in English, e.g. 'Lesson 1'"),
  title_ar: z.string().describe("The row's full title exactly as printed, with any vowel marks shown"),
  title_en: z.string(),
  kind: z.enum(["front_matter", "letter", "dialogue", "language_point", "review", "other"]),
  focus: z.string().nullable().describe("The letter or language point the lesson is about, in Arabic, e.g. ب or السكون"),
  page: z.number().int().nullable().describe("Start page as a Western number"),
  needs_checking: z.boolean(),
  needs_checking_reason: z.string().nullable(),
});

export const Unit = z.object({
  title_ar: z.string().nullable().describe("Unit heading as printed, e.g. الوحدة الأولى; null for front matter"),
  title_en: z.string().nullable(),
  letters: z.string().nullable().describe("The unit's letter group as printed, e.g. ب - ت - ث - ج - ح - خ - د"),
  lessons: z.array(Lesson),
});

export const BookMap = z.object({
  book_title_ar: z.string().nullable(),
  book_title_en: z.string().nullable(),
  level_ar: z.string().nullable(),
  level_en: z.string().nullable(),
  publisher: z.string().nullable().describe("Publisher or institution, in English"),
  year: z.string().nullable(),
  units: z.array(Unit).describe("In book order. Put rows before the first unit (introduction, contents) in a unit with null titles"),
  notes: z.string().nullable().describe("Overlapping or repeated photos, rows you could not read, anything unusual"),
});

export type BookMap = z.infer<typeof BookMap>;

const SCHEMA = strictJsonSchema(BookMap);

const SYSTEM = `You build the lesson map for a beginner Modern Standard Arabic textbook from phone photos of its title page and table of contents. An app uses the map to follow the class through the book lesson by lesson, so every row must be present exactly once and in book order.

The photos are given in page order. They may overlap: the same contents page can appear twice, or the edge of a neighbouring page can be visible. Merge them into one list with no duplicated rows and no gaps; describe any overlap in \`notes\`. Ignore handwriting, fingers and page edges.

Page numbers in the book may use Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩); convert them to ordinary numbers. Lesson numbering may restart in later units; keep each lesson's printed number in \`number_label\`.

Choose \`kind\` for each row: \`front_matter\` (introduction, contents), \`letter\` (a lesson introducing a letter), \`dialogue\` (a row marked حوار), \`language_point\` (rows like من الظواهر اللغوية: a vowel, sukun, shadda, tanween), \`review\`, or \`other\`. A letter lesson with a dialogue is \`dialogue\`.

Never guess an unreadable page number or title: give your best reading and set \`needs_checking\` with a reason.`;

export async function readContents(
  client: Anthropic,
  images: Buffer[],
  opts: { effort?: "low" | "medium" | "high" | "xhigh" | "max"; model?: string } = {},
) {
  const started = Date.now();
  const content: Anthropic.Beta.BetaContentBlockParam[] = images.flatMap((jpeg, i) => [
    { type: "text" as const, text: `Photo ${i + 1} of ${images.length}:` },
    { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: jpeg.toString("base64") } },
  ]);
  content.push({ type: "text", text: "Build the lesson map from these photos." });

  const stream = client.beta.messages.stream({
    model: opts.model ?? "claude-opus-5",
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "high", format: { type: "json_schema", schema: SCHEMA } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new Error("Model declined the contents pages");
  if (message.stop_reason === "max_tokens") throw new Error("Response was cut off at max_tokens");
  const text = message.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Response had no text content");

  return {
    map: BookMap.parse(JSON.parse(text)),
    model: message.model,
    promptVersion: CONTENTS_PROMPT_VERSION,
    latencyMs: Date.now() - started,
    usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
  };
}
