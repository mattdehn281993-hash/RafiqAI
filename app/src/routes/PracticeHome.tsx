// Practice: today's review queue (due cards + new saved words), hear-and-pick
// for every letter the class has reached, and flashcards for the current
// lesson or My Words. Results feed spaced repetition.
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { Flashcards, QuizRunner, ScoreSummary } from "../components/Practice";
import { Button, ErrorNote, Screen, Spinner } from "../components/ui";
import { prepareAudio } from "../lib/audio";
import { builtinCards, letterSet, lettersSoFar } from "../lib/builtin";
import { cardsByIds, getClass, lessonsOf } from "../lib/data";
import { dueCardIds, recordResults, type Result } from "../lib/progress";
import { buildQuiz, type Question } from "../lib/quiz";
import { supabase } from "../lib/supabase";
import type { Card } from "../lib/types";
import { must, useAsync } from "../lib/useAsync";

type Mode = { kind: "menu" } | { kind: "quiz"; title: string; questions: Question[] } | { kind: "cards"; title: string; cards: Card[] } | { kind: "done"; title: string; results: Result[] };

const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

export function PracticeHome() {
  const { classId = "" } = useParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const cls = await getClass(classId);
    const { lessons } = await lessonsOf(cls.book_id);
    const current = lessons.find((l) => l.id === cls.current_lesson_id);
    const upTo = current?.position ?? 0;

    const [sets, currentSet, builtins, due, saved, progressed] = await Promise.all([
      lettersSoFar(lessons, upTo),
      letterSet(current?.focus),
      builtinCards(),
      dueCardIds(20),
      supabase.from("saved_words").select("card_id").order("saved_at", { ascending: false }).limit(40),
      supabase.from("progress").select("card_id"),
    ]);
    const savedIds = (must(saved) as { card_id: string }[]).map((s) => s.card_id);
    const practised = new Set((must(progressed) as { card_id: string }[]).map((p) => p.card_id));
    const newSaved = savedIds.filter((id) => !practised.has(id)).slice(0, 5);
    const lookup = await cardsByIds([...new Set([...due, ...newSaved, ...savedIds])]);

    const review = [...due, ...newSaved].map((id) => lookup.get(id)).filter((c): c is Card => !!c);
    const soundsSoFar = sets.flatMap((s) => [s.name, ...s.short, ...s.long]);
    const lessonCards = currentSet ? [currentSet.name, ...currentSet.short, ...currentSet.long] : [];
    const myWords = savedIds.map((id) => lookup.get(id)).filter((c): c is Card => !!c);
    return { review, soundsSoFar, lessonCards, myWords, pool: [...builtins.values(), ...myWords], current, letters: sets.length };
  }, [classId]);

  const [mode, setMode] = useState<Mode>({ kind: "menu" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const byId = useMemo(() => new Map([...(data?.pool ?? []), ...(data?.review ?? [])].map((c) => [c.id, c])), [data]);

  if (loading && !data) return <Screen title="Practice" classId={classId}><Spinner /></Screen>;
  if (error || !data) return <Screen title="Practice" classId={classId}><ErrorNote error={error ?? "Not found"} onRetry={reload} /></Screen>;

  async function done(title: string, results: Result[]) {
    setMode({ kind: "done", title, results });
    setSaveError(null);
    try {
      await recordResults(results);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  function start(next: Mode) {
    const ids = next.kind === "quiz" ? next.questions.flatMap((q) => q.options.map((o) => o.id)) : next.kind === "cards" ? next.cards.map((c) => c.id) : [];
    prepareAudio([...new Set(ids)]).catch(() => {});
    setMode(next);
  }

  if (mode.kind === "quiz") {
    return (
      <Screen title={mode.title} back={`/class/${classId}/practice`} classId={classId}>
        <QuizRunner questions={mode.questions} onDone={(r) => done(mode.title, r)} />
      </Screen>
    );
  }
  if (mode.kind === "cards") {
    return (
      <Screen title={mode.title} back={`/class/${classId}/practice`} classId={classId}>
        <Flashcards cards={mode.cards} onDone={(r) => done(mode.title, r)} />
      </Screen>
    );
  }
  if (mode.kind === "done") {
    return (
      <Screen title={mode.title} classId={classId}>
        <ScoreSummary results={mode.results} cards={byId}>
          {saveError && <ErrorNote error={`Progress wasn't saved: ${saveError}`} />}
          <Button
            className="w-full"
            onClick={() => {
              setMode({ kind: "menu" });
              reload();
            }}
          >
            Back to Practice
          </Button>
        </ScoreSummary>
      </Screen>
    );
  }

  const options: { title: string; detail: string; count: number; go: () => void; primary?: boolean }[] = [
    {
      title: "Today's review",
      detail: data.review.length ? "Cards due today and new saved words" : "Nothing due. Come back tomorrow, or try another practice",
      count: data.review.length,
      primary: true,
      go: () => start({ kind: "cards", title: "Today's review", cards: data.review }),
    },
    {
      title: "Hear & pick",
      detail: `Sounds of the ${data.letters} letter${data.letters === 1 ? "" : "s"} your class has reached`,
      count: data.soundsSoFar.length,
      go: () => start({ kind: "quiz", title: "Hear & pick", questions: buildQuiz(shuffle(data.soundsSoFar).slice(0, 12), data.pool, 12) }),
    },
    {
      title: "This lesson",
      detail: data.current ? `Flashcards for ${data.current.title_en ?? data.current.title_ar}` : "Flashcards for the current lesson",
      count: data.lessonCards.length,
      go: () => start({ kind: "cards", title: "This lesson", cards: data.lessonCards }),
    },
    {
      title: "My Words",
      detail: "Flashcards of the cards you saved",
      count: data.myWords.length,
      go: () => start({ kind: "cards", title: "My Words", cards: shuffle(data.myWords).slice(0, 15) }),
    },
  ];

  return (
    <Screen title="Practice" subtitle="A few minutes a day" classId={classId}>
      <ul className="flex flex-col gap-2">
        {options.map((o) => (
          <li key={o.title}>
            <button
              disabled={o.count === 0}
              onClick={o.go}
              className={`flex min-h-20 w-full items-center gap-3 rounded-3xl p-4 text-left active:scale-[0.99] disabled:opacity-50 ${o.primary ? "bg-accent text-on-accent" : "bg-surface"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">{o.title}</span>
                <span className={`block text-sm ${o.primary ? "opacity-90" : "text-muted"}`}>{o.detail}</span>
              </span>
              {o.count > 0 && <span className={`rounded-full px-3 py-1 text-sm font-bold ${o.primary ? "bg-on-accent/20" : "bg-accent-soft text-accent"}`}>{o.count}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
