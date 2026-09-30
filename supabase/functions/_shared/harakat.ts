// Vowel-mark (harakat) utilities.
//
// Claude returns each item twice: as printed on the page, and fully vowelled.
// Comparing the two here, in code, tells us which marks the AI added, rather
// than trusting the model to report its own additions.

/** fathatan, dammatan, kasratan, fatha, damma, kasra, shadda, sukun, dagger alif */
const VOWEL_MARKS = new Set([
  0x064b, 0x064c, 0x064d, 0x064e, 0x064f, 0x0650, 0x0651, 0x0652, 0x0670,
]);

/** maddah / hamza above / hamza below: part of the letter, not a vowel mark */
const LETTER_MODIFIERS = new Set([0x0653, 0x0654, 0x0655]);

/** tatweel, zero-width joiners, Quranic annotation marks: ignored entirely */
function isIgnored(cp: number): boolean {
  return cp === 0x0640 || cp === 0x200c || cp === 0x200d || (cp >= 0x06d6 && cp <= 0x06ed);
}

export const MARK_NAMES: Record<string, string> = {
  "ً": "fathatan",
  "ٌ": "dammatan",
  "ٍ": "kasratan",
  "َ": "fatha",
  "ُ": "damma",
  "ِ": "kasra",
  "ّ": "shadda",
  "ْ": "sukun",
  "ٰ": "dagger alif",
};

export type Cluster = { base: string; marks: string[] };

/** Arabic letters only: punctuation (، ؟ * :), digits, dots and spaces are not compared. */
function isLetter(base: string): boolean {
  const cp = base.codePointAt(0) ?? 0;
  return (cp >= 0x0621 && cp <= 0x064a) || (cp >= 0x066e && cp <= 0x06d3) || (cp >= 0x06fa && cp <= 0x06ff);
}

/** Split text into letters, each with the vowel marks sitting on it. */
export function clusters(text: string): Cluster[] {
  const out: Cluster[] = [];
  for (const ch of text.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (isIgnored(cp)) continue;
    const last = out[out.length - 1];
    if (VOWEL_MARKS.has(cp)) {
      if (last) last.marks.push(ch);
      else out.push({ base: "", marks: [ch] }); // stray mark with no letter
    } else if (LETTER_MODIFIERS.has(cp) && last) {
      last.base += ch;
    } else {
      out.push({ base: ch, marks: [] });
    }
  }
  return out;
}

/** The letters only, with every vowel mark and punctuation removed; words separated by single spaces. */
export function skeleton(text: string): string {
  return clusters(text)
    .map((c) => (isLetter(c.base) ? c.base : /\s/.test(c.base) ? " " : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export type MarkedCluster = {
  base: string;
  printed: string[];
  added: string[];
  dropped: string[];
};

export type MarkDiff =
  | {
      status: "ok";
      clusters: MarkedCluster[];
      printedCount: number;
      addedCount: number;
      droppedCount: number;
    }
  | { status: "letters_differ"; printedSkeleton: string; fullSkeleton: string };

/**
 * Compare the as-printed text with the fully vowelled text.
 * - `added`: marks the AI supplied (to be shown lighter)
 * - `dropped`: marks printed in the book that the full version lost (always a problem)
 * - `letters_differ`: the AI changed the letters themselves (always needs checking)
 */
export function diffMarks(printed: string, full: string): MarkDiff {
  const p = clusters(printed).filter((c) => isLetter(c.base));
  const f = clusters(full).filter((c) => isLetter(c.base));
  const ps = p.map((c) => c.base).join("");
  const fs = f.map((c) => c.base).join("");
  if (ps !== fs) {
    return { status: "letters_differ", printedSkeleton: skeleton(printed), fullSkeleton: skeleton(full) };
  }
  let printedCount = 0;
  let addedCount = 0;
  let droppedCount = 0;
  const merged = f.map((fc, i) => {
    const pm = p[i].marks;
    const added = fc.marks.filter((m) => !pm.includes(m));
    const dropped = pm.filter((m) => !fc.marks.includes(m));
    printedCount += pm.length;
    addedCount += added.length;
    droppedCount += dropped.length;
    return { base: fc.base, printed: pm, added, dropped };
  });
  return { status: "ok", clusters: merged, printedCount, addedCount, droppedCount };
}

/** Rebuild `full` keeping only the marks that were printed in the book. */
export function printedOnly(diff: Extract<MarkDiff, { status: "ok" }>, full: string): string {
  // Walk `full` so spaces and punctuation stay where they were.
  let i = 0;
  let out = "";
  for (const c of clusters(full)) {
    if (!isLetter(c.base)) {
      out += c.base + c.marks.join("");
      continue;
    }
    const mc = diff.clusters[i++];
    out += c.base + c.marks.filter((m) => !mc.added.includes(m)).join("");
  }
  return out;
}
