// One card: tap anywhere to hear it; Slow, Save and Report underneath.
// `compact` is for half-width cells on a phone: icon-only actions, no Play
// button (tapping the card plays it), long notes collapsed.
import { useState } from "react";
import { playCard } from "../lib/audio";
import { supabase } from "../lib/supabase";
import type { Card } from "../lib/types";
import { ArabicText } from "./ArabicText";

const ICON = {
  play: "M8 5v14l11-7z",
  slow: "M4 12h4l3-7 4 14 3-7h2",
  save: "M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z",
  report: "M5 21V4m0 0h11l-2 4 2 4H5",
};

export function CardTile({
  card,
  saved,
  onToggleSave,
  audio = true,
  size = "md",
  compact = false,
}: {
  card: Card;
  saved?: boolean;
  onToggleSave?: () => void;
  audio?: boolean;
  size?: "md" | "lg";
  compact?: boolean;
}) {
  const [playing, setPlaying] = useState<"normal" | "slow" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [noteOpen, setNoteOpen] = useState(!compact);

  async function play(slow: boolean) {
    if (!audio) return;
    setError(null);
    setPlaying(slow ? "slow" : "normal");
    try {
      await playCard(card.id, slow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not play audio");
    } finally {
      setPlaying(null);
    }
  }

  const long = card.arabic_full.length > 40;
  const arabicSize = long ? "text-2xl" : size === "lg" ? "text-5xl" : compact ? "text-3xl" : "text-4xl";

  return (
    <article className={`flex w-full min-w-0 flex-col rounded-2xl border bg-surface p-3 ${card.needs_checking ? "border-warn" : "border-border"}`}>
      <button
        className="flex flex-col items-stretch text-left active:opacity-70"
        onClick={() => play(false)}
        disabled={!audio}
        aria-label={`Play ${card.pronunciation}`}
      >
        <div className="text-right">
          <ArabicText printed={card.arabic_printed} full={card.arabic_full} className={arabicSize} />
        </div>
        <p className="mt-1 break-words text-base font-bold text-accent">{card.pronunciation}</p>
        <p className="break-words text-[15px] leading-snug">{card.english}</p>
        {card.sound_note && <p className="mt-1 text-sm italic text-muted">{card.sound_note}</p>}
      </button>

      {card.needs_checking && (
        <button
          className="mt-2 rounded-xl bg-warn-bg px-3 py-2 text-left text-sm text-warn"
          onClick={() => setNoteOpen((o) => !o)}
          aria-expanded={noteOpen}
        >
          <span className={noteOpen ? "" : "line-clamp-2"}>
            Needs checking{card.needs_checking_reason ? `: ${card.needs_checking_reason}` : ""}
          </span>
        </button>
      )}
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}

      {audio && !compact && (
        <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
          <IconButton label={playing === "normal" ? "Playing" : "Play"} onClick={() => play(false)} path={ICON.play} active={playing === "normal"} />
          <IconButton label={playing === "slow" ? "Playing slow" : "Slow"} onClick={() => play(true)} path={ICON.slow} active={playing === "slow"} />
          {onToggleSave && <IconButton label={saved ? "Saved" : "Save"} onClick={onToggleSave} path={ICON.save} filled={saved} />}
          <button className="ml-auto min-h-11 px-2 text-sm text-muted" onClick={() => setReporting(true)}>
            Report
          </button>
        </div>
      )}
      {audio && compact && (
        <div className="mt-auto flex items-center justify-between border-t border-border pt-1">
          <IconButton label={playing === "slow" ? "Playing slow" : "Play slow"} onClick={() => play(true)} path={ICON.slow} active={playing === "slow"} iconOnly />
          {onToggleSave && <IconButton label={saved ? "Saved" : "Save"} onClick={onToggleSave} path={ICON.save} filled={saved} iconOnly />}
          <IconButton label="Report a mistake" onClick={() => setReporting(true)} path={ICON.report} iconOnly muted />
        </div>
      )}
      {reporting && <ReportForm card={card} onClose={() => setReporting(false)} />}
    </article>
  );
}

function IconButton({
  label,
  onClick,
  path,
  active,
  filled,
  iconOnly,
  muted,
}: {
  label: string;
  onClick: () => void;
  path: string;
  active?: boolean;
  filled?: boolean;
  iconOnly?: boolean;
  muted?: boolean;
}) {
  const tone = active ? "bg-accent-soft text-accent" : muted ? "text-muted active:bg-soft" : "text-text active:bg-soft";
  return (
    <button
      onClick={onClick}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium ${iconOnly ? "min-w-11" : "px-2.5"} ${tone}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={path} />
      </svg>
      {!iconOnly && label}
    </button>
  );
}

function ReportForm({ card, onClose }: { card: Card; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | string>("idle");

  async function send() {
    setState("sending");
    const { error } = await supabase
      .from("reports")
      .insert({ card_id: card.id, card_version: card.current_version, message: message.trim() });
    setState(error ? error.message : "sent");
  }

  if (state === "sent") {
    return (
      <p className="mt-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">
        Thanks. An editor will check this card.{" "}
        <button className="font-semibold underline" onClick={onClose}>
          Close
        </button>
      </p>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl bg-soft p-3">
      <label className="text-sm font-medium" htmlFor={`report-${card.id}`}>
        What's wrong with this card?
      </label>
      <textarea
        id={`report-${card.id}`}
        className="min-h-20 rounded-xl border border-border bg-surface p-2"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="e.g. the teacher says the meaning is …"
      />
      {state !== "idle" && state !== "sending" && <p className="text-sm text-bad">{state}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="min-h-11 flex-1 rounded-xl bg-accent px-3 font-semibold text-on-accent disabled:opacity-50" disabled={!message.trim() || state === "sending"} onClick={send}>
          {state === "sending" ? "Sending…" : "Send"}
        </button>
        <button className="min-h-11 px-3 text-muted" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
