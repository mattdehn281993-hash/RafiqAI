// Queries used by several screens. Row-level security decides what comes back.
import { supabase } from "./supabase";
import type { Card, ClassInfo, Lesson, PageRow, PlacedCard, Unit } from "./types";
import { must } from "./useAsync";

export async function myClasses(): Promise<ClassInfo[]> {
  const { data: auth } = await supabase.auth.getUser();
  const rows = must(
    await supabase
      .from("memberships")
      .select("role, class:classes(id, name, book_id, current_lesson_id, book:books(title_ar, title_en, level_en))")
      .eq("user_id", auth.user?.id ?? ""),
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

export async function cardsByIds(ids: string[]): Promise<Map<string, Card>> {
  if (ids.length === 0) return new Map();
  const rows = must(await supabase.from("current_cards").select("*").in("id", ids)) as Card[];
  return new Map(rows.map((c) => [c.id, c]));
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
