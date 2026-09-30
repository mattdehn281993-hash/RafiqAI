// Editing a card's text. Used inline while checking a scanned page (before it is
// saved) and in a bottom sheet when an editor corrects a saved card.
import { useState, type ReactNode } from "react";
import { Button, ErrorNote } from "./ui";

export type CardFields = {
  arabic_printed: string;
  arabic_full: string;
  tts_text: string;
  pronunciation: string;
  english: string;
  sound_note: string | null;
  needs_checking: boolean;
  needs_checking_reason: string | null;
};

type TextKey = "arabic_printed" | "arabic_full" | "tts_text" | "pronunciation" | "english";

export function CardFieldsForm({ value, onChange }: { value: CardFields; onChange: (v: CardFields) => void }) {
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
  return (
    <div className="flex flex-col gap-2">
      {field("arabic_printed", "Arabic exactly as printed", true)}
      {field("arabic_full", "Arabic with all vowel marks", true)}
      {field("tts_text", "What the voice says", true)}
      {field("pronunciation", "Easy pronunciation")}
      {field("english", "English meaning")}
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
  onSave,
  onClose,
}: {
  initial: CardFields;
  message?: string;
  onSave: (changes: Partial<CardFields>, reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changes = changedFields(initial, value);

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
      <CardFieldsForm value={value} onChange={setValue} />
      <label className="mt-2 block">
        <span className="text-xs font-medium text-muted">Why (e.g. “teacher's meaning”)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-0.5 min-h-12 w-full rounded-xl border border-border bg-bg px-3" />
      </label>
      <p className="mt-2 text-xs text-muted">Saving creates a new version for everyone in the class. If the Arabic the voice says changed, new audio is made on the next play.</p>
      {error && <div className="mt-2"><ErrorNote error={error} /></div>}
      <div className="sticky -bottom-4 -mx-4 mt-3 bg-surface px-4 pb-1 pt-2">
        <Button className="w-full" disabled={busy || Object.keys(changes).length === 0} onClick={save}>
          {busy ? "Saving…" : "Save correction"}
        </Button>
      </div>
    </Sheet>
  );
}
