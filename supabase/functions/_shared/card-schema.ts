// What Claude returns for one textbook page. Shared by the Phase 0 spike and
// (later) the explain-page edge function.
import * as z from "zod";

export const ITEM_KINDS = [
  "letter", // a bare letter, voiced by its name (ب → بَاء)
  "syllable", // a letter with a vowel mark, voiced as a sound (بَ → ba)
  "word",
  "phrase",
  "sentence",
  "instruction", // exercise instruction line, e.g. أُنْظُرْ وَلَاحِظْ
  "heading",
  "number",
  "other",
] as const;

export const PageItem = z.object({
  order: z.number().int().describe("1-based reading order: rows top to bottom, right to left within a row"),
  row: z.number().int().describe("1-based visual row on the page, top to bottom"),
  column: z.number().int().describe("1-based position within the row, counted from the RIGHT edge"),
  kind: z.enum(ITEM_KINDS),
  arabic_printed: z.string().describe("Exactly as printed: same letters, only the vowel marks visible on the page"),
  arabic_full: z.string().describe("Same letters with every vowel mark: printed marks kept, missing marks filled in"),
  tts_text: z.string().describe("Exact fully-vowelled text to send to text-to-speech, in the form it should be spoken"),
  pronunciation: z.string().describe("Easy pronunciation of tts_text, following the pronunciation key"),
  english: z.string(),
  sound_note: z.string().nullable().describe("One line on a tricky sound, or null"),
  needs_checking: z.boolean(),
  needs_checking_reason: z.string().nullable(),
});

export const PageExtraction = z.object({
  page_number: z.string().nullable().describe("Printed page number, if visible"),
  page_kind: z.enum(["letter_grid", "exercise", "instruction", "dense_text", "vocabulary", "mixed", "other"]),
  page_summary: z.string().describe("One sentence in English: what this page teaches or asks the student to do"),
  image_quality: z.enum(["good", "fair", "poor"]),
  image_quality_note: z.string().nullable(),
  skipped: z.string().nullable().describe("Anything on the page deliberately not captured as an item, and why"),
  items: z.array(PageItem),
});

export type PageItem = z.infer<typeof PageItem>;
export type PageExtraction = z.infer<typeof PageExtraction>;
