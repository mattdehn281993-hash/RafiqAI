// Tonight's Preview: a short run-through of the next lesson (its letter's name
// and sounds, plus words and instructions from any saved pages), one card at a
// time with audio, then a 2-minute quiz.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArabicText } from "../components/ArabicText";
import { QuizRunner, ScoreSummary } from "../components/Practice";
import { Button, ErrorNote, Screen, Spinner } from "../components/ui";
import { playCard, prepareAudio } from "../lib/audio";
import { builtinCards, letterSet } from "../lib/builtin";
import { cardsByIds, getClass, lessonsOf, nextLesson, pagesOf } from "../lib/data";
import { recordResults, type Result } from "../lib/progress";
import { buildQuiz } from "../lib/quiz";
import { supabase } from "../lib/supabase";
import type { Card } from "../lib/types";
import { must, useAsync } from "../lib/useAsync";

const QUIZ_SECONDS = 120;
const WORD_KINDS = ["word", "phrase", "sentence", "instruction"];

async function lessonWordCards(lessonId: string, bookId: string): Promise<Card[]> {
  const pages = (await pagesOf(bookId)).filter((p) => p.lesson_id === lessonId);
  if (pages.length === 0) return [];
  const placed = must(
    await supabase.from("page_cards").select("card_id, page_id, position").in("page_id", pages.map((p) => p.id)).order("position"),
  ) as { card_id: string }[];
  const cards = await cardsByIds(placed.map((p) => p.card_id));
  const seen = new Set<string>();
  return placed
    .map((p) => cards.get(p.card_id))
    .filter((c): c is Card => !!c && WORD_KINDS.includes(c.kind))
    .filter((c) => (seen.has(c.tts_text) ? false : (seen.add(c.tts_text), true)))
    .slice(0, 12);
}

export function Preview() {
  const { classId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const { data, error, loading, reload } = useAsync(async () => {
    const cls = await getClass(classId);
    const { lessons } = await lessonsOf(cls.book_id);
    const requested = lessons.find((l) => l.id === params.get("lesson"));
    const lesson = requested ?? nextLesson(lessons, cls.current_lesson_id);
    if (!lesson) throw new Error("This class has no lessons yet");
    const [set, words, builtins] = await Promise.all([letterSet(lesson.focus), lessonWordCards(lesson.id, cls.book_id), builtinCards()]);
    const cards = [...(set ? [set.name, ...set.short, ...set.long] : []), ...words];
    // Wrong answers: other letters' sounds for sound questions, and the book's other words for meanings.
    const bookWords = must(
      await supabase.from("current_cards").select("*").eq("book_id", cls.book_id).in("kind", ["word", "phrase"]).limit(80),
    ) as Card[];
    const pool = [...cards, ...builtins.values(), ...bookWords];
    return { cls, lessons, lesson, set, cards, pool, current: lessons.find((l) => l.id === cls.current_lesson_id) };
  }, [classId, params.get("lesson")]);

  const [step, setStep] = useState<"cards" | "quiz" | "done">("cards");
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setStep("cards");
    setIndex(0);
    if (data?.cards.length) prepareAudio(data.cards.map((c) => c.id)).catch(() => {});
  }, [data]);

  const questions = useMemo(() => (data ? buildQuiz(data.cards, data.pool, 20) : []), [data]);
  const byId = useMemo(() => new Map((data?.pool ?? []).map((c) => [c.id, c])), [data]);

  if (loading && !data) return <Screen title="Tonight's Preview" back={`/class/${classId}`}><Spinner /></Screen>;
  if (error || !data) return <Screen title="Tonight's Preview" back={`/class/${classId}`}><ErrorNote error={error ?? "Not found"} onRetry={reload} /></Screen>;

  const { lesson, cards, current } = data;
  const title = lesson.title_en ?? lesson.title_ar;

  async function finishQuiz(r: Result[]) {
    setResults(r);
    setStep("done");
    try {
      await Promise.all([
        recordResults(r),
        supabase.from("preview_runs").insert({ lesson_id: lesson.id, score: r.filter((x) => x.correct).length, total: r.length }).then(({ error }) => {
          if (error) throw error;
        }),
      ]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  const switcher = current && current.id !== lesson.id && (
    <button className="min-h-11 text-sm font-semibold text-accent" onClick={() => setParams({ lesson: current.id })}>
      Preview today's lesson instead
    </button>
  );

  if (cards.length === 0) {
    return (
      <Screen title="Tonight's Preview" subtitle={title} back={`/class/${classId}`}>
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
          There's nothing to preview for this lesson yet. Snap its pages with Page Helper and they'll appear here.
        </p>
        {switcher}
      </Screen>
    );
  }

  if (step === "quiz") {
    return (
      <Screen title="2-minute quiz" subtitle={title} back={`/class/${classId}`}>
        {questions.length > 0 ? <QuizRunner questions={questions} seconds={QUIZ_SECONDS} onDone={finishQuiz} /> : <p className="text-muted">Not enough cards for a quiz yet.</p>}
      </Screen>
    );
  }

  if (step === "done") {
    return (
      <Screen title="Preview done" subtitle={title} back={`/class/${classId}`}>
        <ScoreSummary results={results} cards={byId}>
          {saveError && <ErrorNote error={`Your score wasn't saved: ${saveError}`} />}
          <p className="text-center text-muted">You're ready for {title}. See you in class!</p>
          <Button className="w-full" onClick={() => navigate(`/class/${classId}`)}>
            Back to today
          </Button>
        </ScoreSummary>
      </Screen>
    );
  }

  const card = cards[index];
  const last = index === cards.length - 1;
  return (
    <Screen
      title="Tonight's Preview"
      subtitle={title}
      back={`/class/${classId}`}
      action={
        <div className="flex gap-2">
          {index > 0 && (
            <Button variant="secondary" onClick={() => setIndex((i) => i - 1)}>
              Back
            </Button>
          )}
          <Button
            className="flex-1"
            onClick={() => {
              if (last) setStep("quiz");
              else {
                setIndex((i) => i + 1);
                playCard(cards[index + 1].id).catch(() => {});
              }
            }}
          >
            {last ? "Start the 2-minute quiz" : "Next"}
          </Button>
        </div>
      }
    >
      <div className="flex gap-1" aria-label={`Card ${index + 1} of ${cards.length}`}>
        {cards.map((c, i) => (
          <span key={c.id} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-accent" : "bg-soft"}`} />
        ))}
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">{stageLabel(card, data.set?.name.id)}</p>
      <button
        className="mt-2 flex min-h-80 w-full flex-col items-center justify-center gap-3 rounded-3xl bg-surface p-6 active:bg-soft"
        onClick={() => playCard(card.id).catch(() => {})}
      >
        <ArabicText printed={card.arabic_printed} full={card.arabic_full} className={card.arabic_full.length > 30 ? "text-3xl" : "text-7xl"} />
        <p className="text-2xl font-bold text-accent">{card.pronunciation}</p>
        <p className="text-center text-lg">{card.english}</p>
        {card.sound_note && <p className="text-center text-sm italic text-muted">{card.sound_note}</p>}
        <p className="text-sm text-muted">Tap to hear it</p>
      </button>
      <div className="mt-2 flex justify-center gap-2">
        <Button variant="ghost" onClick={() => playCard(card.id, true).catch(() => {})}>
          Hear it slowly
        </Button>
      </div>
      {index === 0 && switcher}
      {index === 0 && (
        <p className="mt-2 text-center text-xs text-muted">
          Or practise any time from <Link to={`/class/${classId}/practice`} className="font-semibold text-accent">Practice</Link>.
        </p>
      )}
    </Screen>
  );
}

function stageLabel(card: Card, nameId?: string) {
  if (card.id === nameId) return "The letter";
  if (card.kind === "syllable") return card.pronunciation.length > 2 && /(aa|ii|uu)$/.test(card.pronunciation) ? "Long sound" : "Short sound";
  if (card.kind === "instruction") return "What the teacher will say";
  return "Word from the lesson";
}
