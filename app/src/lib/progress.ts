// Practice results → each student's private progress rows, with simple spaced
// repetition: every right answer in a row doubles the wait (1, 2, 4, 8, 16, 30
// days); a miss brings the card back in 10 minutes.
import { supabase } from "./supabase";
import { must } from "./useAsync";

const DAY = 24 * 60 * 60 * 1000;
const INTERVALS = [1, 2, 4, 8, 16, 30].map((d) => d * DAY);
const RETRY = 10 * 60 * 1000;

export type Result = { cardId: string; correct: boolean };

type Row = { card_id: string; times_practised: number; times_correct: number; streak: number };

export async function recordResults(results: Result[]): Promise<void> {
  if (results.length === 0) return;
  const ids = [...new Set(results.map((r) => r.cardId))];
  const existing = must(
    await supabase.from("progress").select("card_id, times_practised, times_correct, streak").in("card_id", ids),
  ) as Row[];
  const rows = new Map(existing.map((r) => [r.card_id, r]));
  const now = Date.now();

  for (const r of results) {
    const prev = rows.get(r.cardId) ?? { card_id: r.cardId, times_practised: 0, times_correct: 0, streak: 0 };
    rows.set(r.cardId, {
      card_id: r.cardId,
      times_practised: prev.times_practised + 1,
      times_correct: prev.times_correct + (r.correct ? 1 : 0),
      streak: r.correct ? prev.streak + 1 : 0,
    });
  }

  const payload = ids.map((id) => {
    const row = rows.get(id)!;
    const last = results.filter((r) => r.cardId === id).at(-1)!;
    const wait = last.correct ? INTERVALS[Math.min(row.streak, INTERVALS.length) - 1] : RETRY;
    return {
      ...row,
      last_result: last.correct ? "correct" : "wrong",
      next_review_at: new Date(now + wait).toISOString(),
      updated_at: new Date(now).toISOString(),
    };
  });
  must(await supabase.from("progress").upsert(payload, { onConflict: "user_id,card_id" }));
}

/**
 * Cards due for review now, most overdue first. The request doesn't include the
 * time (it would never match a saved offline copy); "due" is decided here.
 */
export async function dueCardIds(limit = 15): Promise<string[]> {
  const rows = must(
    await supabase.from("progress").select("card_id, next_review_at").not("next_review_at", "is", null).order("next_review_at").limit(500),
  ) as { card_id: string; next_review_at: string }[];
  const now = Date.now();
  return rows.filter((r) => Date.parse(r.next_review_at) <= now).slice(0, limit).map((r) => r.card_id);
}
