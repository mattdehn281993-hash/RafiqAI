// Guided speaking practice for textbook items. The student gets a situation
// and the other speaker's line, answers aloud, then reveals a model response.
// Self-graded, so it stays out of the vocabulary review queue; the end screen
// offers another round with just the ones that need work.
import { useRef, useState } from "react";
import type { Card } from "../lib/types";
import { ArabicText } from "./ArabicText";
import { Button } from "./ui";

export function ContextPractice({ cards }: { cards: Card[] }) {
  const all = cards.filter((card) => card.usage);
  const [round, setRound] = useState<Card[]>(all);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [needWork, setNeedWork] = useState<Card[] | null>(null); // set when the round is over
  const results = useRef<{ card: Card; ok: boolean }[]>([]);
  const graded = useRef(-1); // the index already graded, so a double tap counts once
  const card = round[index];

  if (!all.length) return <p className="rounded-2xl bg-surface p-4 text-muted">This page does not have conversation practice yet.</p>;

  function start(next: Card[]) {
    results.current = [];
    graded.current = -1;
    setRound(next);
    setIndex(0);
    setRevealed(false);
    setNeedWork(null);
  }

  function grade(ok: boolean) {
    if (graded.current === index) return;
    graded.current = index;
    results.current.push({ card, ok });
    if (index + 1 >= round.length) {
      setNeedWork(results.current.filter((r) => !r.ok).map((r) => r.card));
    } else {
      setIndex(index + 1);
      setRevealed(false);
    }
  }

  if (needWork) {
    const comfortable = round.length - needWork.length;
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-3xl bg-accent p-6 text-center text-on-accent">
          <p className="text-4xl font-bold">
            {comfortable}/{round.length}
          </p>
          <p className="mt-1">responses felt comfortable</p>
        </div>
        {needWork.length > 0 ? (
          <Button onClick={() => start(needWork)}>
            Practise the {needWork.length} that need{needWork.length === 1 ? "s" : ""} work
          </Button>
        ) : (
          <p className="text-center text-sm text-muted">Well done. Try them again tomorrow to make them stick.</p>
        )}
        <Button variant="secondary" onClick={() => start(all)}>
          Practise all {all.length} again
        </Button>
      </div>
    );
  }

  const usage = card.usage!;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          Conversation {index + 1} of {round.length}
        </span>
        <span className="font-semibold">Answer out loud</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-soft">
        <div className="h-full bg-accent transition-all" style={{ width: `${((index + 1) / round.length) * 100}%` }} />
      </div>

      <section className="rounded-3xl bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Situation</p>
        <p className="mt-1 text-lg font-semibold">{usage.context}</p>

        <div className="mt-5 rounded-2xl rounded-bl-md bg-soft p-4">
          <p className="text-xs font-bold text-muted">THEM</p>
          <p className="mt-1 text-right">
            <ArabicText printed={usage.prompt_arabic} full={usage.prompt_arabic} className="text-3xl" />
          </p>
          <p className="font-bold text-accent">{usage.prompt_pronunciation}</p>
          <p className="text-sm">{usage.prompt_english}</p>
        </div>

        <div className="mt-3 rounded-2xl rounded-br-md border-2 border-dashed border-accent bg-accent-soft p-4">
          <p className="text-xs font-bold text-accent">YOU</p>
          {revealed ? (
            <>
              <p className="mt-1 text-right">
                <ArabicText printed={usage.response_arabic} full={usage.response_arabic} className="text-3xl" />
              </p>
              <p className="font-bold text-accent">{usage.response_pronunciation}</p>
              <p className="text-sm">{usage.response_english}</p>
            </>
          ) : (
            <p className="py-5 text-center font-semibold text-accent">Say your answer before you reveal it</p>
          )}
        </div>

        {revealed && (
          <p className="mt-4 rounded-xl bg-warn-bg p-3 text-sm text-warn">
            <strong>Pattern:</strong> {usage.tip}
          </p>
        )}
      </section>

      {revealed ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => grade(false)}>
            Need practice
          </Button>
          <Button onClick={() => grade(true)}>I said it</Button>
        </div>
      ) : (
        <Button onClick={() => setRevealed(true)}>Reveal a model answer</Button>
      )}
      <p className="text-center text-xs text-muted">A model answer is one natural answer, not the only possible answer.</p>
    </div>
  );
}
