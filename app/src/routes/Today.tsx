// Today's Class: the lesson the class is on, its saved pages, the teacher's
// classroom instructions, and "Snap a page" in thumb reach.
import { useEffect } from "react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArabicText } from "../components/ArabicText";
import { InstallPrompt } from "../components/InstallPrompt";
import { LetterSounds } from "../components/LetterSounds";
import { Button, ErrorNote, RowLink, Screen, Section, Spinner } from "../components/ui";
import { playCard, prepareAudio } from "../lib/audio";
import { letterSet } from "../lib/builtin";
import { getClass, lessonsOf, nextLesson, pagesOf } from "../lib/data";
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
    const currentLesson = lessons.find((l) => l.id === cls.current_lesson_id);
    const sounds = await letterSet(currentLesson?.focus).catch(() => null);
    const today = new Date().toISOString().slice(0, 10);
    const [runs, checkin] = await Promise.all([
      supabase.from("preview_runs").select("lesson_id, score, total, completed_at").order("completed_at", { ascending: false }).limit(20),
      cls.current_lesson_id
        ? supabase.from("checkins").select("answer").eq("lesson_id", cls.current_lesson_id).eq("checkin_date", today).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    return {
      cls, lessons, units, pages, instructions, reports,
      previewRuns: (must(runs) as { lesson_id: string; score: number; total: number }[]),
      checkin: (checkin.data as { answer: string } | null)?.answer ?? null,
      sounds,
    };
  }, [classId]);

  useEffect(() => rememberClass(classId), [classId]);
  useEffect(() => {
    if (data?.instructions.length) prepareAudio(data.instructions.map((c) => c.id)).catch(() => {});
  }, [data]);

  if (loading && !data) return <Screen title="Today" classId={classId}><Spinner /></Screen>;
  if (error || !data) return <Screen title="Today" classId={classId}><ErrorNote error={error ?? "Not found"} onRetry={reload} /></Screen>;

  const { cls, lessons, units, pages, instructions, reports, previewRuns, checkin, sounds } = data;
  const current = lessons.find((l) => l.id === cls.current_lesson_id) ?? lessons.find((l) => l.kind !== "front_matter");
  const teaching = lessons.filter((l) => l.kind !== "front_matter");
  const number = current ? teaching.indexOf(current) + 1 : 0;
  const unit = units.find((u) => u.id === current?.unit_id);
  const lessonPages = pages.filter((p) => p.lesson_id === current?.id);
  // Every saved page stays findable, whatever lesson (or none) it was filed under.
  const recent = [...pages].sort((a, b) => b.scanned_at.localeCompare(a.scanned_at)).slice(0, 5);
  const lessonTitle = (id: string | null) => lessons.find((l) => l.id === id)?.title_en ?? null;
  const upNext = nextLesson(lessons, cls.current_lesson_id);
  const previewed = previewRuns.find((r) => r.lesson_id === upNext?.id);

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
      <InstallPrompt />
      {teaching.length === 0 && (
        <div className="mb-3 rounded-3xl border-2 border-warn bg-warn-bg p-4 text-warn">
          <p className="font-bold">This class has no lesson list yet</p>
          <p className="mt-1 text-sm">
            {cls.role === "editor"
              ? "Photograph the book's contents pages (فهرس المحتويات) so Rafiq can build the lessons. Pages you've saved will be filed into them."
              : "Ask your class editor to add the book's contents pages."}
          </p>
          {cls.role === "editor" && (
            <Link to={`/class/${classId}/setup-map`} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-semibold text-on-accent">
              Add your lesson list
            </Link>
          )}
        </div>
      )}
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

      {sounds && (
        <Section title={`Learn the letter: ${sounds.name.pronunciation}`} action={<Link to={`/class/${classId}/letters`} className="text-sm font-semibold text-accent">All letters</Link>}>
          <LetterSounds set={sounds} compact />
        </Section>
      )}

      {upNext && (
        <Link
          to={`/class/${classId}/preview`}
          className="mt-3 flex min-h-16 items-center gap-3 rounded-3xl border border-border bg-surface p-4 active:bg-soft"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent" aria-hidden>
            <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
              <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Tonight's Preview</span>
            <span className="block truncate text-sm text-muted">
              {previewed ? `Done: ${previewed.score}/${previewed.total}. Tap to go again` : `${upNext.title_en ?? upNext.title_ar} · about 5 minutes`}
            </span>
          </span>
          {upNext.focus && upNext.focus.length <= 2 && (
            <span className="font-arabic text-4xl text-accent" lang="ar">
              {upNext.focus}
            </span>
          )}
        </Link>
      )}

      <Link
        to={`/class/${classId}/talk`}
        className="mt-3 flex min-h-16 items-center gap-3 rounded-3xl border border-border bg-surface p-4 active:bg-soft"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent" aria-hidden>
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
            <path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM17 9h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-4-3h-3" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Conversation</span>
          <span className="block truncate text-sm text-muted">Greetings, how are you, your name, where you're from</span>
        </span>
        <span className="font-arabic text-xl text-accent" lang="ar" dir="rtl">
          السَّلَامُ
        </span>
      </Link>

      <CheckIn lessonId={cls.current_lesson_id} answer={checkin} />

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

      {recent.length > 0 && (
        <Section title="Recently saved pages">
          <div className="flex flex-col gap-2">
            {recent.map((p) => (
              <RowLink key={p.id} to={`/class/${classId}/page/${p.id}`}>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft font-bold text-accent">
                  {p.page_number ?? "?"}
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-1 text-sm">{p.summary}</span>
                  <span className={`block text-xs ${p.lesson_id ? "text-muted" : "font-semibold text-warn"}`}>
                    {lessonTitle(p.lesson_id) ?? "Not in a lesson yet: tap to set its page number"}
                  </span>
                </span>
              </RowLink>
            ))}
          </div>
        </Section>
      )}

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

      <Section title="Account">
        <RowLink to="/account">
          <span className="font-medium">Password and sign out</span>
        </RowLink>
      </Section>
    </Screen>
  );
}

/** After class: "I followed most of today's lesson" (success metric). */
function CheckIn({ lessonId, answer }: { lessonId: string | null; answer: string | null }) {
  const [value, setValue] = useState(answer);
  const [error, setError] = useState<string | null>(null);
  if (!lessonId) return null;

  async function choose(a: "yes" | "partly" | "no") {
    const before = value;
    setValue(a);
    setError(null);
    const { error } = await supabase
      .from("checkins")
      .upsert({ lesson_id: lessonId, answer: a, checkin_date: new Date().toISOString().slice(0, 10) }, { onConflict: "user_id,lesson_id,checkin_date" });
    if (error) {
      setValue(before);
      setError(error.message);
    }
  }

  const labels = { yes: "Yes", partly: "Partly", no: "Not really" } as const;
  return (
    <div className="mt-3 rounded-3xl bg-surface p-4">
      <p className="text-sm font-semibold">After class: did you follow most of today's lesson?</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
          <button
            key={k}
            onClick={() => choose(k)}
            aria-pressed={value === k}
            className={`min-h-11 rounded-xl border text-sm font-medium ${value === k ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
          >
            {labels[k]}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </div>
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
