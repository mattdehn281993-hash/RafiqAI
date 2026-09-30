// The 28 letters and their short-vowel syllables. Used by the audio spike now
// and as seed data for Learn cards Level 1 (Sounds) later.
// Order follows the textbook (Al-Azhar series, Preparatory Level): lessons 1–28
// run ب … ي and end with الهمزة, so hamza comes last instead of alif first.
// Pronunciations follow the key in explain-page-prompt.ts.

export type Letter = {
  /** stable id for files and storage keys; never derive ids from position */
  key: string;
  letter: string;
  /** spelled-out letter name, fully vowelled with pause sukun: what TTS says for the name card */
  name: string;
  namePron: string;
  /** romanised consonant used to build syllable pronunciations ("" for hamza: word-initial hamza is not written) */
  sound: string;
  /** the letter as it carries a vowel (hamza sits on an alif) */
  carrier: string;
};

export const LETTERS: Letter[] = [
  { key: "b", letter: "ب", name: "بَاءْ", namePron: "baaʾ", sound: "b", carrier: "ب" },
  { key: "t", letter: "ت", name: "تَاءْ", namePron: "taaʾ", sound: "t", carrier: "ت" },
  { key: "th", letter: "ث", name: "ثَاءْ", namePron: "thaaʾ", sound: "th", carrier: "ث" },
  { key: "j", letter: "ج", name: "جِيمْ", namePron: "jiim", sound: "j", carrier: "ج" },
  { key: "hh", letter: "ح", name: "حَاءْ", namePron: "ḥaaʾ", sound: "ḥ", carrier: "ح" },
  { key: "kh", letter: "خ", name: "خَاءْ", namePron: "khaaʾ", sound: "kh", carrier: "خ" },
  { key: "d", letter: "د", name: "دَالْ", namePron: "daal", sound: "d", carrier: "د" },
  { key: "dh", letter: "ذ", name: "ذَالْ", namePron: "dhaal", sound: "dh", carrier: "ذ" },
  { key: "r", letter: "ر", name: "رَاءْ", namePron: "raaʾ", sound: "r", carrier: "ر" },
  { key: "z", letter: "ز", name: "زَايْ", namePron: "zaay", sound: "z", carrier: "ز" },
  { key: "s", letter: "س", name: "سِينْ", namePron: "siin", sound: "s", carrier: "س" },
  { key: "sh", letter: "ش", name: "شِينْ", namePron: "shiin", sound: "sh", carrier: "ش" },
  { key: "ss", letter: "ص", name: "صَادْ", namePron: "ṣaad", sound: "ṣ", carrier: "ص" },
  { key: "dd", letter: "ض", name: "ضَادْ", namePron: "ḍaad", sound: "ḍ", carrier: "ض" },
  { key: "tt", letter: "ط", name: "طَاءْ", namePron: "ṭaaʾ", sound: "ṭ", carrier: "ط" },
  { key: "zz", letter: "ظ", name: "ظَاءْ", namePron: "ẓaaʾ", sound: "ẓ", carrier: "ظ" },
  { key: "ayn", letter: "ع", name: "عَيْنْ", namePron: "ʿayn", sound: "ʿ", carrier: "ع" },
  { key: "gh", letter: "غ", name: "غَيْنْ", namePron: "ghayn", sound: "gh", carrier: "غ" },
  { key: "f", letter: "ف", name: "فَاءْ", namePron: "faaʾ", sound: "f", carrier: "ف" },
  { key: "q", letter: "ق", name: "قَافْ", namePron: "qaaf", sound: "q", carrier: "ق" },
  { key: "k", letter: "ك", name: "كَافْ", namePron: "kaaf", sound: "k", carrier: "ك" },
  { key: "l", letter: "ل", name: "لَامْ", namePron: "laam", sound: "l", carrier: "ل" },
  { key: "m", letter: "م", name: "مِيمْ", namePron: "miim", sound: "m", carrier: "م" },
  { key: "n", letter: "ن", name: "نُونْ", namePron: "nuun", sound: "n", carrier: "ن" },
  { key: "h", letter: "ه", name: "هَاءْ", namePron: "haaʾ", sound: "h", carrier: "ه" },
  { key: "w", letter: "و", name: "وَاوْ", namePron: "waaw", sound: "w", carrier: "و" },
  { key: "y", letter: "ي", name: "يَاءْ", namePron: "yaaʾ", sound: "y", carrier: "ي" },
  { key: "hamza", letter: "ء", name: "هَمْزَهْ", namePron: "HAM-zah", sound: "", carrier: "أ" },
];

export const SHORT_VOWELS = [
  { mark: "َ", name: "fatha", vowel: "a" },
  { mark: "ُ", name: "damma", vowel: "u" },
  { mark: "ِ", name: "kasra", vowel: "i" },
] as const;

export type Syllable = { key: string; letter: string; vowel: string; text: string; pron: string };

/** 28 letters × 3 short vowels = the 84 syllables the PRD says to test before launch. */
export function shortVowelSyllables(): Syllable[] {
  return LETTERS.flatMap((l) =>
    SHORT_VOWELS.map((v) => ({
      key: l.key,
      letter: l.letter,
      vowel: v.name,
      // Hamza with kasra sits under the alif: إِ
      text: l.letter === "ء" && v.vowel === "i" ? "إِ" : l.carrier + v.mark,
      pron: l.sound + v.vowel,
    })),
  );
}
