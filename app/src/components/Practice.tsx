// Practice building blocks: a multiple-choice quiz (optionally timed) and
// see-it-say-it flashcards. Both report results for progress tracking.
import { useEffect, useRef, useState } from "react";
import { playCard } from "../lib/audio";
import type { Result } from "../lib/progress";
import type { Question } from "../lib/quiz";
import type { Card } from "../lib/types";
import { ArabicText } from "./ArabicText";
import { Button } from "./ui";

const PROMPT: Record<Question["type"], string> = {
  hear: "Listen, then tap what you heard",
  meaning: "What does this mean?",
  sound: "How does this sound?",
};

export function QuizRunner({
  questions,
  seconds,
  onDone,
}: {
  questions: Question[];
  /** Time limit for the whole quiz (Tonight's Preview uses 120). */
  seconds?: number;
  onDone: (results: Result[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [left, setLeft] = useState(seconds ?? 0);
  const results = useRef<Result[]>([]);
  const done = useRef(false);
  const q = questions[index];

  function finish() {
    if (done.current) return;
    done.current = true;
    onDone(results.current);
  }

  useEffect(() => {
    if (!seconds) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);
  useEffect(() => {
    if (seconds && left === 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, seconds]);

  // Listening questions play by themselves when they appear.
  useEffect(() => {
    if (q?.type === "hear") playCard(q.card.id).catch(() => {});
  }, [q]);

  if (!q) return null;

  function pick(option: Card) {
    if (picked) return;
    setPicked(option.id);
    const correct = option.id === q.card.id;
    results.current.push({ cardId: q.card.id, correct });
    if (q.type !== "hear") playCard(q.card.id).catch(() => {});
    setTimeout(
      () => {
        if (index + 1 >= questions.length) finish();
        else {
          setIndex((i) => i + 1);
          setPicked(null);
        }
      },
      correct ? 700 : 1600,
    );
  }

  const label = (c: Card) =>
    q.type === "hear" ? (
      <ArabicText printed={c.arabic_printed} full={c.arabic_full} className="text-3xl" />
    ) : q.type === "meaning" ? (
      <span className="text-base">{c.english}</span>
    ) : (
      <span className="text-lg font-bold">{c.pronunciation}</span>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          {index + 1} / {questions.length}
        </span>
        {seconds ? <span className={`font-mono font-bold ${left <= 15 ? "text-bad" : "text-text"}`}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span> : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-soft">
        <div className="h-full bg-accent transition-all" style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>

      <p className="text-center font-semibold">{PROMPT[q.type]}</p>
      <div className="flex min-h-36 items-center justify-center rounded-3xl bg-surface p-4">
        {q.type === "hear" ? (
          <button onClick={() => playCard(q.card.id).catch(() => {})} className="flex size-24 items-center justify-center rounded-full bg-accent text-on-accent active:scale-95" aria-label="Play again">
            <svg viewBox="0 0 24 24" className="size-10" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        ) : (
          <ArabicText printed={q.card.arabic_printed} full={q.card.arabic_full} className={q.card.arabic_full.length > 30 ? "text-3xl" : "text-6xl"} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {q.options.map((o) => {
          const state = picked ? (o.id === q.card.id ? "right" : o.id === picked ? "wrong" : "idle") : "idle";
          return (
            <button
              key={o.id}
              onClick={() => pick(o)}
              className={`flex min-h-20 items-center justify-center rounded-2xl border-2 p-2 text-center transition active:scale-[0.98] ${
                state === "right" ? "border-accent bg-accent-soft" : state === "wrong" ? "border-bad bg-bad-bg" : "border-border bg-surface"
              }`}
            >
              {label(o)}
            </button>
          );
        })}
      </div>
      {picked && picked !== q.card.id && (
        <p className="text-center text-sm text-muted">
          It was <strong className="text-text">{q.card.pronunciation}</strong>: {q.card.english}
        </p>
      )}
    </div>
  );
}

/** See it, say it out loud, then check: self-graded flashcards. */
export function Flashcards({ cards, onDone }: { cards: Card[]; onDone: (results: Result[]) => void }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const results = useRef<Result[]>([]);
  const card = cards[index];
  if (!card) return null;

  function grade(correct: boolean) {
    results.current.push({ cardId: card.id, correct });
    if (index + 1 >= cards.length) onDone(results.current);
    else {
      setIndex((i) => i + 1);
      setFlipped(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {index + 1} / {cards.length}
      </p>
      <button
        className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-surface p-6 active:bg-soft"
        onClick={() => {
          setFlipped(true);
          playCard(card.id).catch(() => {});
        }}
      >
        <ArabicText printed={card.arabic_printed} full={card.arabic_full} className={card.arabic_full.length > 30 ? "text-3xl" : "text-6xl"} />
        {flipped ? (
          <>
            <p className="text-2xl font-bold text-accent">{card.pronunciation}</p>
            <p className="text-lg">{card.english}</p>
            {card.sound_note && <p className="text-sm italic text-muted">{card.sound_note}</p>}
          </>
        ) : (
          <p className="text-muted">Say it out loud, then tap to check</p>
        )}
      </button>
      {flipped ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => grade(false)}>
            Not yet
          </Button>
          <Button onClick={() => grade(true)}>Got it</Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => playCard(card.id, true).catch(() => {})}>
          Hear it slowly
        </Button>
      )}
    </div>
  );
}

export function ScoreSummary({ results, cards, children }: { results: Result[]; cards: Map<string, Card>; children?: React.ReactNode }) {
  const right = results.filter((r) => r.correct).length;
  const missed = [...new Set(results.filter((r) => !r.correct).map((r) => r.cardId))].map((id) => cards.get(id)).filter((c): c is Card => !!c);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl bg-accent p-6 text-center text-on-accent">
        <p className="text-5xl font-bold">
          {right}/{results.length}
        </p>
        <p className="mt-1 opacity-90">{results.length === 0 ? "No answers" : right === results.length ? "Perfect!" : right / results.length >= 0.7 ? "Well done" : "Good start. Missed ones come back soon."}</p>
      </div>
      {missed.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">To look at again</p>
          <ul className="flex flex-col gap-2">
            {missed.map((c) => (
              <li key={c.id}>
                <button onClick={() => playCard(c.id).catch(() => {})} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2 text-left active:bg-soft">
                  <span>
                    <span className="block font-bold text-accent">{c.pronunciation}</span>
                    <span className="block text-sm">{c.english}</span>
                  </span>
                  <ArabicText printed={c.arabic_printed} full={c.arabic_full} className="text-3xl" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {children}
    </div>
  );
}
