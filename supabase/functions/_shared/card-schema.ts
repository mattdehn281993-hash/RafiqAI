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

/**
 * Speaking practice: a tiny exchange that shows how a textbook word is used.
 * Created after a page is saved (teach-page), stored apart from the card.
 */
export const CardUsage = z.object({
  context: z.string().describe("A short English situation, such as 'You are pointing at a book in class.'"),
  prompt_arabic: z.string().describe("What the other person says, fully vowelled"),
  prompt_pronunciation: z.string().describe("Easy pronunciation of the prompt"),
  prompt_english: z.string().describe("Plain English meaning of the prompt"),
  response_arabic: z.string().describe("A natural response containing the target item, fully vowelled"),
  response_pronunciation: z.string().describe("Easy pronunciation of the response"),
  response_english: z.string().describe("Plain English meaning of the response"),
  tip: z.string().describe("One short explanation of the reusable sentence pattern"),
});

export type CardUsage = z.infer<typeof CardUsage>;

/** Kinds of card worth practising in conversation. */
export const CONVERSATIONAL_KINDS = ["word", "phrase", "sentence"] as const;

/** A complete conversation: every field filled in (editors can't save a blank one). */
export function isCompleteUsage(usage: CardUsage): boolean {
  return Object.values(usage).every((value) => value.trim().length > 0);
}

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
