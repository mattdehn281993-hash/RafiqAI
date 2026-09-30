// The built-in course cards (Level 1: letter names, short and long sounds;
// Level 4: everyday conversation), looked up by their built-in key.
import { letterKeyForFocus } from "@shared/sounds.ts";
import { supabase } from "./supabase";
import type { Card } from "./types";
import { must } from "./useAsync";

let cache: Promise<Map<string, Card>> | null = null;

/** builtin_key → card, loaded once per session. */
export function builtinCards(): Promise<Map<string, Card>> {
  cache ??= (async () => {
    const [keys, cards] = await Promise.all([
      supabase.from("cards").select("id, builtin_key").not("builtin_key", "is", null),
      supabase.from("current_cards").select("*").is("book_id", null),
    ]);
    const byId = new Map((must(cards) as Card[]).map((c) => [c.id, c]));
    const out = new Map<string, Card>();
    for (const k of must(keys) as { id: string; builtin_key: string | null }[]) {
      const card = byId.get(k.id);
      if (k.builtin_key && card) out.set(k.builtin_key, card);
    }
    return out;
  })().catch((err) => {
    cache = null;
    throw err;
  });
  return cache;
}

export type LetterSet = { name: Card; short: Card[]; long: Card[] };

/** The letter's name card and its short (fatha, damma, kasra) and long (aa, uu, ii) sounds. */
export async function letterSet(focus: string | null | undefined): Promise<LetterSet | null> {
  const key = letterKeyForFocus(focus);
  if (!key) return null;
  const all = await builtinCards();
  const name = all.get(`name-${key}`);
  if (!name) return null;
  const pick = (suffixes: string[]) => suffixes.map((s) => all.get(`syl-${key}-${s}`)).filter((c): c is Card => !!c);
  return { name, short: pick(["fatha", "damma", "kasra"]), long: pick(["long-aa", "long-uu", "long-ii"]) };
}

/** Letter sets for every letter lesson up to (and including) a position in the book. */
export async function lettersSoFar(lessons: { focus: string | null; position: number; kind: string }[], upTo: number) {
  const seen = new Set<string>();
  const sets: LetterSet[] = [];
  for (const l of lessons) {
    if (l.position > upTo || !["letter", "dialogue"].includes(l.kind)) continue;
    const key = letterKeyForFocus(l.focus);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const set = await letterSet(l.focus);
    if (set) sets.push(set);
  }
  return sets;
}
