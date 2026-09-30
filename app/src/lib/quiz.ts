// Builds quiz questions from a set of cards, with look-alike wrong answers
// (ba / bu / bi, or other words from the same lesson).
import type { Card } from "./types";

export type Question =
  | { type: "hear"; card: Card; options: Card[] } // hear the audio, pick the Arabic
  | { type: "meaning"; card: Card; options: Card[] } // see the Arabic, pick the English
  | { type: "sound"; card: Card; options: Card[] }; // see the Arabic, pick the pronunciation

const shuffle = <T,>(items: T[]): T[] => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const isSound = (c: Card) => c.kind === "syllable" || c.kind === "letter";
const isWord = (c: Card) => ["word", "phrase", "sentence", "instruction", "heading"].includes(c.kind) && c.english.length < 80;

function distinctBy(cards: Card[], key: (c: Card) => string): Card[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    const k = key(c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Letters beginners mix up: the same shape with different dots, or close sounds.
const LOOK_ALIKES = ["بتث", "جحخ", "دذ", "رز", "سش", "صض", "طظ", "عغ", "فق", "سص", "تط", "دض", "ذزظ", "كق", "هح", "ءع"];

const baseLetter = (c: Card) => [...c.arabic_full.normalize("NFC")].find((ch) => /[ء-ي]/.test(ch)) ?? "";
const vowelOf = (c: Card) => c.pronunciation.toLowerCase().replace(/^[^aiu]*/, "");
const lookAlike = (a: string, b: string) => LOOK_ALIKES.some((group) => group.includes(a) && group.includes(b));

/** Lower = easier to confuse with the right answer, so a better wrong option. */
function confusability(card: Card, other: Card): number {
  if (isSound(card) && isSound(other)) {
    const [a, b] = [baseLetter(card), baseLetter(other)];
    if (a === b) return 0; // تَ vs تُ vs تِ: the vowel is the question
    if (lookAlike(a, b) && vowelOf(card) === vowelOf(other)) return 1; // تَ vs بَ vs ثَ
    if (vowelOf(card) === vowelOf(other)) return 2;
    return 3;
  }
  return other.kind === card.kind ? 0 : 1;
}

/** Up to 3 wrong answers that differ on the shown field, most confusable first. */
function wrongOptions(card: Card, pool: Card[], field: (c: Card) => string): Card[] {
  const candidates = distinctBy(
    pool.filter((c) => c.id !== card.id && field(c) !== field(card)),
    field,
  );
  const ranked = shuffle(candidates).sort((x, y) => confusability(card, x) - confusability(card, y));
  // Two close ones and one looser one, so the question is fair but not a coin toss.
  const close = ranked.filter((c) => confusability(card, c) <= 1).slice(0, 2);
  const rest = ranked.filter((c) => !close.includes(c));
  return [...close, ...rest].slice(0, 3);
}

/**
 * `cards` are what's being tested; `pool` supplies wrong answers (should include
 * the cards themselves plus extra look-alikes).
 */
export function buildQuiz(cards: Card[], pool: Card[], max = 30): Question[] {
  const questions: Question[] = [];
  for (const card of shuffle(distinctBy(cards, (c) => c.tts_text))) {
    const types: Question["type"][] = isSound(card) ? ["hear", "sound"] : isWord(card) ? ["meaning", "hear"] : [];
    for (const type of shuffle(types)) {
      const field = type === "hear" ? (c: Card) => c.arabic_full : type === "meaning" ? (c: Card) => c.english : (c: Card) => c.pronunciation;
      const wrong = wrongOptions(card, pool, field);
      if (wrong.length < 2) continue;
      questions.push({ type, card, options: shuffle([card, ...wrong]) });
      break; // one question per card per round; the other type comes next time
    }
  }
  return questions.slice(0, max);
}
