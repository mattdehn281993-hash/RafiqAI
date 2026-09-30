import { diffMarks, printedOnly } from "@shared/harakat.ts";

/**
 * Arabic with the book's own vowel marks in full colour and AI-added marks
 * lighter: the full text in the "added" colour underneath, the printed-only
 * text exactly on top (marks don't change letter widths, so they line up).
 */
export function ArabicText({ printed, full, className = "" }: { printed: string; full: string; className?: string }) {
  const diff = diffMarks(printed, full);
  const base = `font-arabic leading-[1.9] ${className}`;
  if (diff.status === "ok" && diff.addedCount > 0) {
    return (
      <span className={`ar-stack ${base}`} lang="ar" dir="rtl">
        <span className="ar-full" aria-hidden>
          {full}
        </span>
        <span className="ar-printed">{printedOnly(diff, full)}</span>
      </span>
    );
  }
  return (
    <span className={base} lang="ar" dir="rtl">
      {full}
    </span>
  );
}
