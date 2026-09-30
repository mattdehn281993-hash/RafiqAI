// Letters: all 28 letters in the book's order, available from day one, with or
// without a class. Tap a letter to hear its name and sounds. Inside a class,
// today's letter and the letters the class has reached are marked.
import { useState } from "react";
import { Link } from "react-router";
import { LETTERS, letterKeyForFocus } from "@shared/sounds.ts";
import { Sheet } from "../components/CardEditor";
import { LetterSounds } from "../components/LetterSounds";
import { ErrorNote, Screen, Spinner } from "../components/ui";
import { letterSet, type LetterSet } from "../lib/builtin";
import { useBase } from "../lib/base";
import { getClass, lessonsOf } from "../lib/data";
import type { Lesson } from "../lib/types";
import { useAsync } from "../lib/useAsync";

export function Alphabet() {
  const { classId, base } = useBase();
  const { data, error, loading, reload } = useAsync(async () => {
    if (!classId) return { reached: new Set<string | undefined>(), todayKey: undefined as string | undefined, lessonOf: new Map<string | undefined, Lesson>() };
    const cls = await getClass(classId);
    const { lessons } = await lessonsOf(cls.book_id);
    const current = lessons.find((l) => l.id === cls.current_lesson_id);
    // Which letters the class has reached (letter lessons up to the current one).
    const reached = new Set(
      lessons.filter((l) => l.kind === "letter" && current && l.position <= current.position).map((l) => letterKeyForFocus(l.focus)),
    );
    const todayKey = letterKeyForFocus(current?.focus);
    const lessonOf = new Map(lessons.filter((l) => l.kind === "letter").map((l) => [letterKeyForFocus(l.focus), l]));
    return { reached, todayKey, lessonOf };
  }, [classId]);
  const [open, setOpen] = useState<{ key: string; set: LetterSet | null; loading: boolean; error?: string } | null>(null);

  async function openLetter(key: string, letter: string) {
    setOpen({ key, set: null, loading: true });
    try {
      const set = await letterSet(letter);
      setOpen({ key, set, loading: false, error: set ? undefined : "Sounds for this letter aren't available" });
    } catch (err) {
      setOpen({ key, set: null, loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (loading && !data) return <Screen title="Learn" classId={classId} learn><Spinner /></Screen>;
  if (error || !data) return <Screen title="Learn" classId={classId} learn><ErrorNote error={error ?? "Not found"} onRetry={reload} /></Screen>;

  const openLetterInfo = open ? LETTERS.find((l) => l.key === open.key) : null;
  const openLesson = open ? data.lessonOf.get(open.key) : null;

  return (
    <Screen title="Learn" subtitle="The 28 Arabic letters · tap one to hear it" classId={classId} learn>
      <LearnSwitch base={base} active="letters" />
      <ol className="mt-3 grid grid-cols-4 gap-2" dir="rtl">
        {LETTERS.map((l, i) => {
          const isToday = l.key === data.todayKey;
          const reached = data.reached.has(l.key);
          return (
            <li key={l.key}>
              <button
                onClick={() => openLetter(l.key, l.letter)}
                className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl border-2 active:scale-95 ${
                  isToday ? "border-accent bg-accent text-on-accent" : reached ? "border-accent bg-accent-soft" : "border-border bg-surface"
                }`}
                aria-label={`Letter ${l.namePron}${isToday ? ", today's letter" : reached ? ", learned" : ""}`}
              >
                <span className="absolute right-1.5 top-1 text-[10px] opacity-60" dir="ltr">
                  {i + 1}
                </span>
                <span className="font-arabic text-4xl leading-none" lang="ar">
                  {l.letter}
                </span>
                <span className={`mt-1 text-xs font-semibold ${isToday ? "" : "text-accent"}`} dir="ltr">
                  {l.namePron}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {classId && (
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span><span className="mr-1 inline-block size-3 rounded bg-accent align-middle" />Today</span>
        <span><span className="mr-1 inline-block size-3 rounded border-2 border-accent bg-accent-soft align-middle" />Your class has reached it</span>
      </p>
      )}

      {open && (
        <Sheet title={openLetterInfo ? `The letter ${openLetterInfo.namePron}` : "Letter"} onClose={() => setOpen(null)}>
          {openLesson && (
            <p className="-mt-2 mb-3 text-sm text-muted">
              {openLesson.title_en ?? openLesson.title_ar}
              {openLesson.start_page ? ` · page ${openLesson.start_page}` : ""}
            </p>
          )}
          {open.loading && <Spinner />}
          {open.error && <ErrorNote error={open.error} />}
          {open.set && <LetterSounds set={open.set} />}
        </Sheet>
      )}
    </Screen>
  );
}

/** Segmented switch between the two built-in sections. */
export function LearnSwitch({ base, active }: { base: string; active: "letters" | "talk" }) {
  const item = (key: "letters" | "talk", label: string, to: string) => (
    <Link
      to={to}
      replace
      aria-current={active === key ? "page" : undefined}
      className={`flex min-h-11 flex-1 items-center justify-center rounded-xl text-sm font-semibold ${active === key ? "bg-surface text-accent shadow-sm" : "text-muted"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex gap-1 rounded-2xl bg-soft p-1">
      {item("letters", "Letters", `${base}/letters`)}
      {item("talk", "Conversation", `${base}/talk`)}
    </div>
  );
}
