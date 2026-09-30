// What the audio spike voices. Pronunciations follow the key in explain-page-prompt.ts.
import { LETTERS, shortVowelSyllables } from "../../supabase/functions/_shared/sounds.ts";

export type AudioItem = { id: string; group: string; text: string; pron: string; english: string };

const syllables: AudioItem[] = shortVowelSyllables().map((s) => ({
  id: `syl-${s.key}-${s.vowel}`,
  group: "Letter + short vowel (the 84)",
  text: s.text,
  pron: s.pron,
  english: `${s.letter} with ${s.vowel}`,
}));

const names: AudioItem[] = LETTERS.map((l) => ({
  id: `name-${l.key}`,
  group: "Letter names",
  text: l.name,
  pron: l.namePron,
  english: `the letter ${l.letter}`,
}));

const words: AudioItem[] = [
  { id: "word-baab", group: "First words", text: "بَابْ", pron: "baab", english: "door" },
  { id: "word-bayt", group: "First words", text: "بَيْتْ", pron: "bayt", english: "house" },
  { id: "word-kitaab", group: "First words", text: "كِتَابْ", pron: "ki-TAAB", english: "book" },
  { id: "word-qalam", group: "First words", text: "قَلَمْ", pron: "QA-lam", english: "pen" },
];

const classroom: AudioItem[] = [
  { id: "class-listen", group: "Classroom Arabic", text: "اِسْمَعْ", pron: "IS-maʿ", english: "listen" },
  { id: "class-repeat", group: "Classroom Arabic", text: "كَرِّرْ", pron: "KAR-rir", english: "repeat" },
  { id: "class-look", group: "Classroom Arabic", text: "أُنْظُرْ وَلَاحِظْ", pron: "UN-ẓur wa-LAA-ḥiẓ", english: "look and notice" },
  { id: "class-open", group: "Classroom Arabic", text: "اِفْتَحِ الْكِتَابْ", pron: "IF-ta-ḥil ki-TAAB", english: "open the book" },
  { id: "class-write", group: "Classroom Arabic", text: "اُكْتُبْ", pron: "UK-tub", english: "write" },
  { id: "class-read", group: "Classroom Arabic", text: "اِقْرَأْ", pron: "IQ-raʾ", english: "read" },
];

const phrases: AudioItem[] = [
  { id: "phr-morning", group: "Everyday phrases", text: "صَبَاحُ الْخَيْرْ", pron: "ṣa-BAA-ḥul khayr", english: "good morning" },
  { id: "phr-evening", group: "Everyday phrases", text: "مَسَاءُ الْخَيْرْ", pron: "ma-SAA-ʾul khayr", english: "good afternoon / evening" },
  { id: "phr-how", group: "Everyday phrases", text: "كَيْفَ حَالُكْ", pron: "KAY-fa ḤAA-luk", english: "how are you? (to a man)" },
  { id: "phr-name", group: "Everyday phrases", text: "مَا اسْمُكْ", pron: "MAS-muk", english: "what's your name? (to a man)" },
  { id: "phr-age", group: "Everyday phrases", text: "كَمْ عُمْرُكْ", pron: "kam ʿUM-ruk", english: "how old are you? (to a man)" },
];

// Does the voice need an explicit final sukun to stop cleanly in pause form?
const pauseTest: AudioItem[] = [
  { id: "pause-kitaab-bare", group: "Pause-form test", text: "كِتَاب", pron: "ki-TAAB", english: "book, no final mark" },
  { id: "pause-kitaab-sukun", group: "Pause-form test", text: "كِتَابْ", pron: "ki-TAAB", english: "book, final sukun" },
  { id: "pause-kitaab-full", group: "Pause-form test", text: "كِتَابٌ", pron: "ki-TAA-bun", english: "book, full ending (should say -bun)" },
  { id: "pause-qalam-bare", group: "Pause-form test", text: "قَلَم", pron: "QA-lam", english: "pen, no final mark" },
  { id: "pause-qalam-full", group: "Pause-form test", text: "قَلَمٌ", pron: "QA-la-mun", english: "pen, full ending (should say -mun)" },
];

export const AUDIO_ITEMS: AudioItem[] = [...syllables, ...names, ...words, ...classroom, ...phrases, ...pauseTest];
