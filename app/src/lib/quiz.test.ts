import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuiz } from "./quiz.ts";
import type { Card } from "./types.ts";

const card = (id: string, arabic: string, pron: string, kind = "syllable", english = pron): Card => ({
  id, book_id: null, kind, current_version: 1, arabic_printed: arabic, arabic_full: arabic, tts_text: arabic,
  pronunciation: pron, english, sound_note: null, needs_checking: false, needs_checking_reason: null,
  usage: null,
});

const pool = [
  card("ta", "تَ", "ta"), card("tu", "تُ", "tu"), card("ti", "تِ", "ti"),
  card("ba", "بَ", "ba"), card("tha", "ثَ", "tha"),
  card("ja", "جَ", "ja"), card("ʿa", "عَ", "ʿa"), card("qu", "قُ", "qu"), card("ki", "كِ", "ki"),
];

test("sound questions use the same letter's other vowels and look-alike letters", () => {
  for (let run = 0; run < 50; run++) {
    const [q] = buildQuiz([pool[0]], pool);
    const wrong = q.options.filter((o) => o.id !== "ta").map((o) => o.id);
    assert.equal(q.options.length, 4);
    const close = wrong.filter((id) => ["tu", "ti", "ba", "tha"].includes(id));
    assert.ok(close.length >= 2, `expected 2+ confusable options, got ${wrong.join(",")}`);
  }
});

test("meaning questions offer other meanings, never the right one twice", () => {
  const words = [card("w1", "بَيْت", "bayt", "word", "house"), card("w2", "بَاب", "baab", "word", "door"), card("w3", "قَلَم", "QA-lam", "word", "pen"), card("w4", "كِتَاب", "ki-TAAB", "word", "book")];
  for (let run = 0; run < 20; run++) {
    const [q] = buildQuiz([words[0]], words);
    const english = q.options.map((o) => o.english);
    assert.equal(new Set(english).size, english.length);
    assert.ok(q.options.some((o) => o.id === "w1"));
  }
});

test("cards without enough look-alikes are skipped rather than padded", () => {
  assert.equal(buildQuiz([pool[0]], [pool[0]]).length, 0);
});
