// Editing a card's text. Used inline while checking a scanned page (before it is
// saved) and in a bottom sheet when an editor corrects a saved card. Editors can
// also add, edit or remove the card's speaking practice conversation.
import { useState, type ReactNode } from "react";
import type { CardUsage } from "../lib/types";
import { Button, ErrorNote } from "./ui";

export type CardFields = {
  arabic_printed: string;
  arabic_full: string;
  tts_text: string;
  pronunciation: string;
  english: string;
  sound_note: string | null;
  /** Speaking practice (saved cards only); kept apart from the card's own text. */
  usage?: CardUsage | null;
  needs_checking: boolean;
  needs_checking_reason: string | null;
};

type TextKey = "arabic_printed" | "arabic_full" | "tts_text" | "pronunciation" | "english";

const EMPTY_USAGE: CardUsage = {
  context: "", prompt_arabic: "", prompt_pronunciation: "", prompt_english: "",
  response_arabic: "", response_pronunciation: "", response_english: "", tip: "",
};

/** Every part of the conversation filled in (a half-empty one is never saved). */
export const usageComplete = (usage: CardUsage) => Object.values(usage).every((v) => v.trim().length > 0);

export function CardFieldsForm({
  value,
  onChange,
  withUsage = false,
}: {
  value: CardFields;
  onChange: (v: CardFields) => void;
  /** Show the speaking practice section (word, phrase and sentence cards). */
  withUsage?: boolean;
}) {
  const field = (key: TextKey, label: string, arabic = false) => (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        dir={arabic ? "rtl" : "ltr"}
        lang={arabic ? "ar" : "en"}
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        className={`mt-0.5 min-h-12 w-full rounded-xl border border-border bg-bg px-3 ${arabic ? "font-arabic text-xl" : ""}`}
      />
    </label>
  );
  const usageField = (key: keyof CardUsage, label: string, arabic = false) => value.usage && (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        dir={arabic ? "rtl" : "ltr"}
        lang={arabic ? "ar" : "en"}
        value={value.usage[key]}
        onChange={(e) => onChange({ ...value, usage: { ...value.usage!, [key]: e.target.value } })}
        className={`mt-0.5 min-h-12 w-full rounded-xl border border-border bg-bg px-3 ${arabic ? "font-arabic text-xl" : ""}`}
      />
    </label>
  );
  return (
    <div className="flex flex-col gap-2">
      {field("arabic_printed", "Arabic exactly as printed", true)}
      {field("arabic_full", "Arabic with all vowel marks", true)}
      {field("tts_text", "What the voice says", true)}
      {field("pronunciation", "Easy pronunciation")}
      {field("english", "English meaning")}
      {withUsage && !value.usage && (
        <button
          type="button"
          onClick={() => onChange({ ...value, usage: { ...EMPTY_USAGE } })}
          className="min-h-11 rounded-xl border border-dashed border-border text-sm font-semibold text-accent"
        >
          Add a speaking practice conversation
        </button>
      )}
      {withUsage && value.usage && (
        <div className="flex flex-col gap-2 rounded-xl bg-soft p-3">
          <p className="text-sm font-semibold">Speaking practice</p>
          {usageField("context", "Situation")}
          {usageField("prompt_arabic", "Other person says", true)}
          {usageField("prompt_pronunciation", "Prompt pronunciation")}
          {usageField("prompt_english", "Prompt meaning")}
          {usageField("response_arabic", "Student replies", true)}
          {usageField("response_pronunciation", "Reply pronunciation")}
          {usageField("response_english", "Reply meaning")}
          {usageField("tip", "Reusable pattern")}
          {!usageComplete(value.usage) && <p className="text-xs text-warn">Fill in every part, or remove the conversation.</p>}
          <button type="button" onClick={() => onChange({ ...value, usage: null })} className="min-h-11 text-sm font-semibold text-bad">
            Remove this conversation
          </button>
        </div>
      )}
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          className="size-5"
          checked={value.needs_checking}
          onChange={(e) => onChange({ ...value, needs_checking: e.target.checked, needs_checking_reason: e.target.checked ? value.needs_checking_reason : null })}
        />
        <span className="text-sm">Needs checking</span>
      </label>
    </div>
  );
}

/** What changed between two versions of the fields (only changed keys). */
export function changedFields(before: CardFields, after: CardFields): Partial<CardFields> {
  const out: Partial<CardFields> = {};
  for (const key of Object.keys(after) as (keyof CardFields)[]) {
    if (after[key] !== before[key]) (out as Record<string, unknown>)[key] = after[key];
  }
  return out;
}

/** Bottom sheet: thumb-reachable on a phone, scrolls if the keyboard is up. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="min-h-11 px-2 text-muted" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Correct a saved card as a new version (editors). */
export function CorrectCardSheet({
  initial,
  message,
  withUsage = false,
  onSave,
  onClose,
}: {
  initial: CardFields;
  message?: string;
  withUsage?: boolean;
  onSave: (changes: Partial<CardFields>, reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changes = changedFields(initial, value);
  const incomplete = !!value.usage && !usageComplete(value.usage);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(changes, reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Sheet title="Correct this card" onClose={onClose}>
      {message && <p className="mb-3 rounded-xl bg-warn-bg p-3 text-sm text-warn">Report: “{message}”</p>}
      <CardFieldsForm value={value} onChange={setValue} withUsage={withUsage} />
      <label className="mt-2 block">
        <span className="text-xs font-medium text-muted">Why (e.g. “teacher's meaning”)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-0.5 min-h-12 w-full rounded-xl border border-border bg-bg px-3" />
      </label>
      <p className="mt-2 text-xs text-muted">Saving updates the card for everyone in the class (text changes become a new version). If the Arabic the voice says changed, new audio is made on the next play.</p>
      {error && <div className="mt-2"><ErrorNote error={error} /></div>}
      <div className="sticky -bottom-4 -mx-4 mt-3 bg-surface px-4 pb-1 pt-2">
        <Button className="w-full" disabled={busy || incomplete || Object.keys(changes).length === 0} onClick={save}>
          {busy ? "Saving…" : "Save correction"}
        </Button>
      </div>
    </Sheet>
  );
}
