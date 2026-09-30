// The Book Map: every lesson in the book's order, where the class is, and each
// lesson's saved pages. Editors move the class with "We covered up to here".
import { useState } from "react";
import { useParams } from "react-router";
import { ErrorNote, RowLink, Screen, Section, Spinner } from "../components/ui";
import { getClass, lessonsOf, pagesOf } from "../lib/data";
import { supabase } from "../lib/supabase";
import { useAsync } from "../lib/useAsync";

export function Lessons() {
  const { classId = "" } = useParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const cls = await getClass(classId);
    const [{ lessons, units }, pages] = await Promise.all([lessonsOf(cls.book_id), pagesOf(cls.book_id)]);
    return { cls, lessons, units, pages };
  }, [classId]);
  const [open, setOpen] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  if (loading && !data) return <Screen title="Lessons" classId={classId}><Spinner /></Screen>;
  if (error || !data) return <Screen title="Lessons" classId={classId}><ErrorNote error={error ?? "Not found"} onRetry={reload} /></Screen>;

  const { cls, lessons, units, pages } = data;
  const editor = cls.role === "editor";

  async function coveredUpTo(lessonId: string) {
    setMoving(lessonId);
    setMoveError(null);
    const { error } = await supabase.from("classes").update({ current_lesson_id: lessonId }).eq("id", classId);
    setMoving(null);
    if (error) setMoveError(error.message);
    else reload();
  }

  return (
    <Screen title="Lessons" subtitle={cls.book.title_en ?? cls.book.title_ar} classId={classId}>
      {editor && <p className="text-sm text-muted">Tap a lesson, then “We covered up to here” to move the class when the teacher goes faster or slower than the book.</p>}
      {moveError && <div className="mt-3"><ErrorNote error={moveError} /></div>}

      {pages.some((p) => !p.lesson_id) && (
        <Section title="Not in a lesson yet">
          <p className="mb-2 text-sm text-muted">These pages had no readable page number. Open one and set its page number to file it.</p>
          <div className="flex flex-col gap-2">
            {pages.filter((p) => !p.lesson_id).map((p) => (
              <RowLink key={p.id} to={`/class/${classId}/page/${p.id}`}>
                <span className="font-semibold">Page {p.page_number ?? "?"}</span>
                <span className="line-clamp-1 text-sm text-muted">{p.summary}</span>
              </RowLink>
            ))}
          </div>
        </Section>
      )}

      {units.map((u) => {
        const unitLessons = lessons.filter((l) => l.unit_id === u.id);
        if (unitLessons.length === 0) return null;
        return (
          <Section key={u.id} title={u.title_en ?? "Introduction"}>
            <ul className="flex flex-col gap-1.5">
              {unitLessons.map((l) => {
                const isCurrent = l.id === cls.current_lesson_id;
                const lessonPages = pages.filter((p) => p.lesson_id === l.id);
                const expanded = open === l.id;
                return (
                  <li key={l.id} className={`rounded-2xl ${isCurrent ? "bg-accent-soft ring-2 ring-accent" : "bg-surface"}`}>
                    <button className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left" onClick={() => setOpen(expanded ? null : l.id)} aria-expanded={expanded}>
                      <span className="w-10 shrink-0 text-center font-arabic text-3xl text-accent" lang="ar">
                        {l.focus && l.focus.length <= 2 ? l.focus : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{l.title_en ?? l.title_ar}</span>
                        <span className="block text-xs text-muted">
                          {isCurrent ? "Today · " : ""}
                          {l.start_page ? `p. ${l.start_page}` : ""}
                          {lessonPages.length ? ` · ${lessonPages.length} saved page${lessonPages.length > 1 ? "s" : ""}` : ""}
                        </span>
                      </span>
                    </button>
                    {expanded && (
                      <div className="flex flex-col gap-2 px-3 pb-3">
                        <p className="px-1 font-arabic text-lg" lang="ar" dir="rtl">
                          {l.title_ar}
                        </p>
                        {lessonPages.map((p) => (
                          <RowLink key={p.id} to={`/class/${classId}/page/${p.id}`}>
                            <span className="font-semibold">Page {p.page_number ?? "?"}</span>
                            <span className="line-clamp-1 text-sm text-muted">{p.summary}</span>
                          </RowLink>
                        ))}
                        {editor && !isCurrent && (
                          <button
                            className="min-h-12 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50"
                            disabled={moving !== null}
                            onClick={() => coveredUpTo(l.id)}
                          >
                            {moving === l.id ? "Moving…" : "We covered up to here"}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        );
      })}
    </Screen>
  );
}
