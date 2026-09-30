// Queries used by several screens. Row-level security decides what comes back.
import { callFunction, supabase } from "./supabase";
import type { Card, ClassInfo, Lesson, PageRow, PlacedCard, Unit } from "./types";
import { must } from "./useAsync";

export async function myClasses(): Promise<ClassInfo[]> {
  // The session stored on the phone, not a server round trip, so this works offline.
  const { data: auth } = await supabase.auth.getSession();
  const rows = must(
    await supabase
      .from("memberships")
      .select("role, class:classes(id, name, book_id, current_lesson_id, book:books(title_ar, title_en, level_en))")
      .eq("user_id", auth.session?.user.id ?? ""),
  ) as unknown as { role: ClassInfo["role"]; class: Omit<ClassInfo, "role"> | null }[];
  return rows.filter((r) => r.class).map((r) => ({ ...r.class!, role: r.role }));
}

export async function getClass(classId: string): Promise<ClassInfo> {
  const found = (await myClasses()).find((c) => c.id === classId);
  if (!found) throw new Error("You are not in this class");
  return found;
}

export async function lessonsOf(bookId: string): Promise<{ lessons: Lesson[]; units: Unit[] }> {
  const [lessons, units] = await Promise.all([
    supabase.from("lessons").select("*").eq("book_id", bookId).order("position"),
    supabase.from("units").select("*").eq("book_id", bookId).order("position"),
  ]);
  return { lessons: must(lessons) as Lesson[], units: must(units) as Unit[] };
}

export async function pagesOf(bookId: string): Promise<PageRow[]> {
  return must(
    await supabase
      .from("pages")
      .select("id, lesson_id, page_number, page_kind, summary, scanned_at")
      .eq("book_id", bookId)
      .order("page_number", { ascending: true, nullsFirst: false }),
  ) as PageRow[];
}

// Every card fetched is also kept on the phone, so screens that look cards up
// in varying combinations (Practice, My Words, Preview) still work offline.
const LOCAL_CARDS = "rafiq:cards";
function localCards(): Record<string, Card> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_CARDS) ?? "{}");
  } catch {
    return {};
  }
}
function keepCards(rows: Card[]) {
  try {
    const all = localCards();
    for (const c of rows) all[c.id] = c;
    localStorage.setItem(LOCAL_CARDS, JSON.stringify(all));
  } catch {
    // storage full: the service worker's copies still cover most screens
  }
}

export async function cardsByIds(ids: string[]): Promise<Map<string, Card>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = must(await supabase.from("current_cards").select("*").in("id", ids)) as Card[];
    keepCards(rows);
    return new Map(rows.map((c) => [c.id, c]));
  } catch (err) {
    // Offline: use the cards kept on the phone, if they're all there.
    const local = localCards();
    if (ids.every((id) => local[id])) return new Map(ids.map((id) => [id, local[id]]));
    throw err;
  }
}

export async function pageCards(pageId: string): Promise<PlacedCard[]> {
  const placed = must(
    await supabase.from("page_cards").select("card_id, position, row_index, col_index").eq("page_id", pageId).order("position"),
  ) as { card_id: string; position: number; row_index: number | null; col_index: number | null }[];
  const cards = await cardsByIds(placed.map((p) => p.card_id));
  return placed
    .filter((p) => cards.has(p.card_id))
    .map((p) => ({ ...cards.get(p.card_id)!, position: p.position, row_index: p.row_index, col_index: p.col_index }));
}

export async function savedCardIds(): Promise<Set<string>> {
  const rows = must(await supabase.from("saved_words").select("card_id")) as { card_id: string }[];
  return new Set(rows.map((r) => r.card_id));
}

export async function toggleSaved(cardId: string, lessonId: string | null, saved: boolean) {
  if (saved) {
    must(await supabase.from("saved_words").delete().eq("card_id", cardId));
  } else {
    must(await supabase.from("saved_words").upsert({ card_id: cardId, lesson_id: lessonId }));
  }
}

/** The lesson a printed page number falls in, from the lessons' start pages. */
export function lessonForPage(lessons: Lesson[], pageNumber: number | null): Lesson | undefined {
  if (pageNumber === null) return undefined;
  let match: Lesson | undefined;
  for (const l of lessons) {
    if (l.start_page !== null && l.start_page <= pageNumber && (!match || l.start_page >= (match.start_page ?? 0))) match = l;
  }
  return match;
}

/** Groups placed cards into the page's rows (right-to-left order is applied by the layout). */
export function rowsOf(cards: PlacedCard[]): PlacedCard[][] {
  const rows = new Map<number, PlacedCard[]>();
  for (const c of cards) {
    const key = c.row_index ?? c.position;
    rows.set(key, [...(rows.get(key) ?? []), c]);
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, r]) => r.sort((a, b) => (a.col_index ?? 0) - (b.col_index ?? 0)));
}

export type CardChanges = Partial<Pick<Card, "arabic_printed" | "arabic_full" | "tts_text" | "pronunciation" | "english" | "sound_note" | "usage" | "needs_checking" | "needs_checking_reason">>;

/**
 * Editors: save an edit from the card editor. Text changes become a new card
 * version (resolving the report, if any); the speaking practice conversation is
 * saved on its own, since it isn't part of the textbook card.
 */
export async function saveCardEdits(cardId: string, changes: CardChanges, reason: string, reportId?: string) {
  const { usage, ...text } = changes;
  if (Object.keys(text).length) await correctCard(cardId, text, reason, reportId);
  if ("usage" in changes) await callFunction<{ ok: true }>("card-review", { action: "usage", card_id: cardId, usage: usage ?? null });
}

/** Editors: save a correction as a new card version (optionally resolving a report). */
export async function correctCard(cardId: string, changes: CardChanges, reason: string, reportId?: string) {
  return callFunction<{ version: number }>("card-review", {
    action: "correct",
    card_id: cardId,
    changes,
    reason: reason.trim() || "correction",
    report_id: reportId ?? null,
  });
}

/** Editors: set a saved page's printed number and lesson (lesson null = work it out from the number). */
export async function setPageInfo(pageId: string, pageNumber: number | null, lessonId: string | null) {
  return callFunction<{ ok: true }>("card-review", { action: "page", page_id: pageId, page_number: pageNumber, lesson_id: lessonId });
}

export async function dismissReport(reportId: string) {
  return callFunction<{ ok: true }>("card-review", { action: "dismiss", report_id: reportId });
}

/** The lesson after the class's current one (Tonight's Preview is for the next class). */
export function nextLesson(lessons: Lesson[], currentId: string | null): Lesson | undefined {
  const teaching = lessons.filter((l) => l.kind !== "front_matter");
  const i = teaching.findIndex((l) => l.id === currentId);
  return teaching[i + 1] ?? teaching[i] ?? teaching[0];
}

// ─── Queries shared by screens and "Download for offline" ───────────────────
// A screen and the download must build identical requests, so the saved copy
// matches when the phone is offline.

/** Instruction lines seen on this book's saved pages, one per distinct text. */
export async function classroomInstructions(bookId: string): Promise<Card[]> {
  const rows = must(
    await supabase.from("current_cards").select("*").eq("book_id", bookId).eq("kind", "instruction").limit(100),
  ) as Card[];
  const seen = new Set<string>();
  return rows.filter((c) => {
    const key = c.tts_text.replace(/[^\u0621-\u064a\s]/g, "").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function previewRuns(): Promise<{ lesson_id: string; score: number; total: number }[]> {
  return must(
    await supabase.from("preview_runs").select("lesson_id, score, total, completed_at").order("completed_at", { ascending: false }).limit(20),
  ) as { lesson_id: string; score: number; total: number }[];
}

/** Everything a saved page shows. */
export async function loadPageData(classId: string, pageId: string) {
  const page = must(
    await supabase.from("pages").select("id, book_id, lesson_id, page_number, page_kind, summary, scanned_at").eq("id", pageId).single(),
  ) as PageRow & { book_id: string };
  const lesson = page.lesson_id
    ? (must(await supabase.from("lessons").select("title_en, title_ar").eq("id", page.lesson_id).single()) as { title_en: string | null; title_ar: string })
    : null;
  const [cards, saved, cls, map] = await Promise.all([pageCards(pageId), savedCardIds(), getClass(classId), lessonsOf(page.book_id)]);
  return { page, lesson, cards, saved, editor: cls.role === "editor", lessons: map.lessons };
}

const WORD_KINDS = ["word", "phrase", "sentence", "instruction"];

/** Words and instructions from a lesson's saved pages (Tonight's Preview). */
export async function lessonWordCards(lessonId: string, bookId: string): Promise<Card[]> {
  const pages = (await pagesOf(bookId)).filter((p) => p.lesson_id === lessonId);
  if (pages.length === 0) return [];
  const placed = must(
    await supabase.from("page_cards").select("card_id, page_id, position").in("page_id", pages.map((p) => p.id)).order("position"),
  ) as { card_id: string }[];
  const cards = await cardsByIds(placed.map((p) => p.card_id));
  const seen = new Set<string>();
  return placed
    .map((p) => cards.get(p.card_id))
    .filter((c): c is Card => !!c && WORD_KINDS.includes(c.kind))
    .filter((c) => (seen.has(c.tts_text) ? false : (seen.add(c.tts_text), true)))
    .slice(0, 12);
}

/** The book's words, used as wrong answers in quizzes. */
export async function bookWordPool(bookId: string): Promise<Card[]> {
  return must(await supabase.from("current_cards").select("*").eq("book_id", bookId).in("kind", ["word", "phrase"]).limit(80)) as Card[];
}

export type SavedWord = { card_id: string; lesson_id: string | null; saved_at: string };

export async function savedWords(): Promise<SavedWord[]> {
  return must(await supabase.from("saved_words").select("card_id, lesson_id, saved_at").order("saved_at", { ascending: false })) as SavedWord[];
}

/** Card ids that have any practice record (to find saved words never practised). */
export async function practisedCardIds(): Promise<Set<string>> {
  return new Set((must(await supabase.from("progress").select("card_id")) as { card_id: string }[]).map((p) => p.card_id));
}
