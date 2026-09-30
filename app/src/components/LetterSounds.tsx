// A letter's name and its short and long sounds, each tap-to-hear, with "Play all".
// Used on Today (the lesson's letter) and in the Letters tab.
import { useEffect, useState } from "react";
import { playCard, playCardToEnd, prepareAudio } from "../lib/audio";
import type { LetterSet } from "../lib/builtin";
import type { Card } from "../lib/types";

function SoundButton({ card, big, playing, onPlay }: { card: Card; big?: boolean; playing: boolean; onPlay: () => void }) {
  return (
    <button
      onClick={onPlay}
      className={`flex flex-col items-center justify-center rounded-2xl border-2 px-2 py-2 transition active:scale-95 ${
        playing ? "border-accent bg-accent-soft" : "border-border bg-surface"
      } ${big ? "min-h-28" : "min-h-24"}`}
      aria-label={`Play ${card.pronunciation}`}
    >
      <span className={`font-arabic leading-[1.6] ${big ? "text-6xl" : "text-4xl"}`} lang="ar" dir="rtl">
        {card.arabic_full}
      </span>
      <span className="text-sm font-bold text-accent">{card.pronunciation}</span>
    </button>
  );
}

export function LetterSounds({ set, compact = false }: { set: LetterSet; compact?: boolean }) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const all = [set.name, ...set.short, ...set.long];

  useEffect(() => {
    prepareAudio(all.map((c) => c.id)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.name.id]);

  async function play(card: Card) {
    setError(null);
    setPlaying(card.id);
    try {
      await playCardToEnd(card.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not play audio");
    } finally {
      setPlaying((p) => (p === card.id ? null : p));
    }
  }

  async function playAll() {
    setError(null);
    try {
      for (const card of all) {
        setPlaying(card.id);
        await playCardToEnd(card.id);
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not play audio");
    } finally {
      setPlaying(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!compact && <SoundButton card={set.name} big playing={playing === set.name.id} onPlay={() => play(set.name)} />}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Short sounds</p>
        <div className="grid grid-cols-3 gap-2" dir="rtl">
          {set.short.map((c) => (
            <SoundButton key={c.id} card={c} playing={playing === c.id} onPlay={() => play(c)} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Long sounds</p>
        <div className="grid grid-cols-3 gap-2" dir="rtl">
          {set.long.map((c) => (
            <SoundButton key={c.id} card={c} playing={playing === c.id} onPlay={() => play(c)} />
          ))}
        </div>
      </div>
      <button onClick={playAll} className="min-h-12 rounded-2xl bg-accent-soft font-semibold text-accent active:scale-[0.98]">
        Play all {compact ? "sounds" : `(name + ${set.short.length + set.long.length} sounds)`}
      </button>
      {error && <p className="text-sm text-bad">{error}</p>}
      {!compact && playing === null && (
        <button className="min-h-11 text-sm text-muted" onClick={() => playCard(set.name.id, true).catch(() => {})}>
          Hear the name slowly
        </button>
      )}
    </div>
  );
}
