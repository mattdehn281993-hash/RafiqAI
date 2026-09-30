// Today's Class: the lesson the class is on, its saved pages, the teacher's
// classroom instructions, and "Snap a page" in thumb reach.
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArabicText } from "../components/ArabicText";
import { Button, ErrorNote, RowLink, Screen, Section, Spinner } from "../components/ui";
import { playCard, prepareAudio } from "../lib/audio";
import { getClass, lessonsOf, pagesOf } from "../lib/data";
import { supabase } from "../lib/supabase";
import type { Card } from "../lib/types";
import { must, useAsync } from "../lib/useAsync";
import { rememberClass } from "./Home";

export function Today() {
  const { classId = "" } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(async () => {
    const cls = await getClass(classId);
    const [{ lessons, units }, pages, instructions, reports] = await Promise.all([
      lessonsOf(cls.book_id),
      pagesOf(cls.book_id),
      classroomInstructions(cls.book_id),
      cls.role === "editor" ? openReportCount(cls.book_id) : Promise.resolve(0),
    ]);
    return { cls, lessons, units, pages, instructions, reports };
  }, [classId]);

  useEffect(() => rememberClass(classId), [classId]);
  useEffect(() => {
    if (data?.instructions.length) prepareAudio(data.instructions.map((c) => c.id)).catch(() => {});
  }, [data]);

  if (loading && !data) return <Screen title="Today" classId={classId}><Spinner /></Screen>;
  if (error || !data) return <Screen title="Today" classId={classId}><ErrorNote error={error ?? "Not found"} onRetry={reload} /></Screen>;

  const { cls, lessons, units, pages, instructions, reports } = data;
  const current = lessons.find((l) => l.id === cls.current_lesson_id) ?? lessons.find((l) => l.kind !== "front_matter");
  const teaching = lessons.filter((l) => l.kind !== "front_matter");
  const number = current ? teaching.indexOf(current) + 1 : 0;
  const unit = units.find((u) => u.id === current?.unit_id);
  const lessonPages = pages.filter((p) => p.lesson_id === current?.id);

  return (
    <Screen
      title={cls.name}
      subtitle={cls.book.title_en ?? cls.book.title_ar}
      classId={classId}
      action={
        <Button className="w-full text-lg" onClick={() => navigate(`/class/${classId}/snap`)}>
          Snap a page
        </Button>
      }
    >
      {current && (
        <div className="mt-2 rounded-3xl bg-accent p-5 text-on-accent">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
                Today · Lesson {number} of {teaching.length}
              </p>
              <p className="mt-1 text-2xl font-bold leading-tight">{current.title_en}</p>
              <p className="mt-1 font-arabic text-xl opacity-95" lang="ar" dir="rtl">
                {current.title_ar}
              </p>
              {unit?.title_en && <p className="mt-1 text-sm opacity-80">{unit.title_en}{current.start_page ? ` · from page ${current.start_page}` : ""}</p>}
            </div>
            {current.focus && current.focus.length <= 2 && (
              <span className="font-arabic text-7xl leading-none" lang="ar">
                {current.focus}
              </span>
            )}
          </div>
          {cls.role === "editor" && (
            <Link to={`/class/${classId}/lessons`} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-on-accent/15 px-3 text-sm font-semibold">
              We covered up to here →
            </Link>
          )}
        </div>
      )}

      <Section title={`Pages saved for this lesson (${lessonPages.length})`}>
        {lessonPages.length === 0 ? (
          <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
            No pages yet. Snap the pages the teacher is using and Rafiq explains every item on them.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {lessonPages.map((p) => (
              <RowLink key={p.id} to={`/class/${classId}/page/${p.id}`}>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft font-bold text-accent">
                  {p.page_number ?? "?"}
                </span>
                <span className="line-clamp-2 text-sm">{p.summary}</span>
              </RowLink>
            ))}
          </div>
        )}
      </Section>

      {instructions.length > 0 && (
        <Section title="Classroom instructions">
          <div className="flex flex-col gap-2">
            {instructions.map((c) => (
              <button
                key={c.id}
                onClick={() => playCard(c.id).catch(() => {})}
                className="flex min-h-14 flex-col items-end rounded-2xl bg-surface px-4 py-2 text-right active:bg-soft"
              >
                <ArabicText printed={c.arabic_printed} full={c.arabic_full} className="text-xl" />
                <span className="text-sm text-muted">{c.english}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {cls.role === "editor" && (
        <Section title="Class">
          <div className="flex flex-col gap-2">
            <RowLink to={`/class/${classId}/reports`}>
              <span className="font-medium">Reports to review</span>
              {reports > 0 && <span className="rounded-full bg-warn-bg px-2.5 py-0.5 text-sm font-bold text-warn">{reports}</span>}
            </RowLink>
            <RowLink to={`/class/${classId}/invite`}>
              <span className="font-medium">Invite classmates</span>
            </RowLink>
          </div>
        </Section>
      )}

      <button className="mt-8 min-h-11 w-full text-sm text-muted" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </Screen>
  );
}

/** Instruction lines seen on this book's saved pages, one per distinct text. */
async function classroomInstructions(bookId: string): Promise<Card[]> {
  const rows = must(
    await supabase.from("current_cards").select("*").eq("book_id", bookId).eq("kind", "instruction").limit(100),
  ) as Card[];
  const seen = new Set<string>();
  return rows.filter((c) => {
    const key = c.tts_text.replace(/[^ء-ي\s]/g, "").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function openReportCount(bookId: string): Promise<number> {
  const { openReports } = await import("./Reports");
  return (await openReports(bookId)).length;
}
