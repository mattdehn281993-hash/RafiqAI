// A saved page: every card in the page's own layout (rows, right to left).
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { CorrectCardSheet, Sheet } from "../components/CardEditor";
import { CardTile } from "../components/CardTile";
import { ContextPractice } from "../components/ContextPractice";
import { Button, ErrorNote, Screen, Spinner } from "../components/ui";
import { forgetAudio, prepareAudio } from "../lib/audio";
import { loadPageData, rowsOf, saveCardEdits, setPageInfo, toggleSaved } from "../lib/data";
import { callFunction } from "../lib/supabase";
import type { Lesson, PageRow, PlacedCard } from "../lib/types";
import { useAsync } from "../lib/useAsync";

/** Cards worth practising in conversation (matches the server's teach-page). */
const CONVERSATIONAL = ["word", "phrase", "sentence"];

/** Full width for single-item rows and long text; half width otherwise (page layout, right to left). */
const wide = (row: { arabic_full: string }[], c: { arabic_full: string }) => row.length === 1 || c.arabic_full.length > 24;

export function PageView() {
  const { classId = "", pageId = "" } = useParams();
  const { data, error, loading, reload } = useAsync(() => loadPageData(classId, pageId), [pageId]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [audioError, setAudioError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlacedCard | null>(null);
  const [editingPage, setEditingPage] = useState(false);
  // Practice mode is part of the address, so the back arrow and the phone's back
  // gesture both return to the page.
  const [params, setParams] = useSearchParams();
  const practising = params.get("practice") === "1";
  const [teaching, setTeaching] = useState(false);
  const [teachError, setTeachError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSaved(data.saved);
    // Get every card's audio ready so taps play instantly.
    prepareAudio(data.cards.map((c) => c.id))
      .then((failed) => setAudioError(Object.keys(failed).length ? `Audio isn't ready for ${Object.keys(failed).length} cards.` : null))
      .catch((err) => setAudioError(err instanceof Error ? err.message : String(err)));
  }, [data]);

  if (loading && !data) return <Screen title="Page" back={`/class/${classId}`} classId={classId}><Spinner /></Screen>;
  if (error || !data) return <Screen title="Page" back={`/class/${classId}`} classId={classId}><ErrorNote error={error ?? "Not found"} onRetry={reload} /></Screen>;

  const { page, lesson, cards } = data;
  const usable = cards.filter((card) => card.usage);
  const missing = cards.filter((card) => CONVERSATIONAL.includes(card.kind) && !card.usage).length;

  async function createPractice() {
    setTeaching(true);
    setTeachError(null);
    try {
      const result = await callFunction<{ saved: number; eligible: number }>("teach-page", { class_id: classId, page_id: pageId });
      if (!result.saved) setTeachError("None of this page's words are used in everyday conversation, so there's no practice to create.");
      reload();
    } catch (err) {
      setTeachError(err instanceof Error ? err.message : String(err));
    } finally {
      setTeaching(false);
    }
  }

  if (practising) {
    return (
      <Screen
        title="Use it in conversation"
        subtitle={lesson?.title_en ?? lesson?.title_ar ?? `Page ${page.page_number ?? ""}`}
        back={`/class/${classId}/page/${pageId}`}
        classId={classId}
      >
        {/* Self-graded speaking practice: kept out of the vocabulary review queue. */}
        <ContextPractice cards={usable} />
      </Screen>
    );
  }

  async function toggle(cardId: string) {
    const was = saved.has(cardId);
    setSaved((s) => {
      const next = new Set(s);
      if (was) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
    try {
      await toggleSaved(cardId, page.lesson_id, was);
    } catch {
      setSaved((s) => new Set(was ? [...s, cardId] : [...s].filter((id) => id !== cardId)));
    }
  }

  return (
    <Screen
      title={page.page_number ? `Page ${page.page_number}` : "Page"}
      subtitle={lesson?.title_en ?? lesson?.title_ar}
      back={`/class/${classId}`}
      classId={classId}
    >
      {(data.editor || !page.lesson_id) && (
        <div className={`mb-2 flex items-center justify-between gap-2 rounded-2xl px-3 py-2 ${page.lesson_id ? "bg-surface" : "bg-warn-bg text-warn"}`}>
          <span className="min-w-0 text-sm">
            Page {page.page_number ?? "?"} · {lesson?.title_en ?? lesson?.title_ar ?? "not in a lesson yet"}
          </span>
          {data.editor && (
            <button className="min-h-11 shrink-0 px-2 text-sm font-semibold text-accent" onClick={() => setEditingPage(true)}>
              Change
            </button>
          )}
        </div>
      )}
      {page.summary && <p className="text-sm text-muted">{page.summary}</p>}
      {usable.length > 0 && (
        <section className="mt-3 rounded-3xl bg-accent-soft p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Don’t just memorise it</p>
          <p className="mt-1 text-lg font-bold">Use this page in conversation</p>
          <p className="mt-1 text-sm">Respond to {usable.length} realistic situation{usable.length === 1 ? "" : "s"} out loud, then compare with a model answer.</p>
          <Button className="mt-3 w-full" onClick={() => setParams({ practice: "1" })}>Start speaking practice</Button>
        </section>
      )}
      {missing > 0 && (
        <section className={`mt-3 rounded-3xl p-4 ${usable.length ? "border border-border bg-surface" : "bg-accent-soft"}`}>
          {usable.length === 0 && <p className="text-xs font-semibold uppercase tracking-wider text-accent">Turn words into speech</p>}
          <p className="mt-1 text-lg font-bold">{usable.length ? `Practice for ${missing} more word${missing === 1 ? "" : "s"}` : "Create conversation practice"}</p>
          <p className="mt-1 text-sm">Rafiq puts this page's useful words into short situations so you can answer out loud. Takes about half a minute.</p>
          {teachError && <p className="mt-2 rounded-xl bg-warn-bg p-2 text-sm text-warn">{teachError}</p>}
          <Button className="mt-3 w-full" variant={usable.length ? "secondary" : "primary"} disabled={teaching} onClick={createPractice}>
            {teaching ? "Creating practice…" : "Create speaking practice"}
          </Button>
        </section>
      )}
      <div className="mt-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Book reference</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <p className="mt-2 text-xs text-muted">Tap a card to hear it. Light vowel marks were added by Rafiq.</p>
      {audioError && <p className="mt-2 rounded-xl bg-warn-bg p-2 text-sm text-warn">{audioError}</p>}

      <div className="mt-3 flex flex-col gap-2">
        {rowsOf(cards).map((row, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 [&>*]:min-w-0" dir="rtl">
            {row.map((c) => (
              <div key={c.id} dir="ltr" className={`flex min-w-0 ${wide(row, c) ? "col-span-2" : ""}`}>
                <CardTile
                  card={c}
                  saved={saved.has(c.id)}
                  onToggleSave={() => toggle(c.id)}
                  compact={!wide(row, c)}
                  onEdit={data.editor ? () => setEditing(c) : undefined}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {editingPage && (
        <PageInfoSheet
          page={page}
          lessons={data.lessons}
          onClose={() => setEditingPage(false)}
          onSaved={() => {
            setEditingPage(false);
            reload();
          }}
        />
      )}

      {editing && (
        <CorrectCardSheet
          initial={editing}
          withUsage={CONVERSATIONAL.includes(editing.kind)}
          onClose={() => setEditing(null)}
          onSave={async (changes, reason) => {
            await saveCardEdits(editing.id, changes, reason);
            forgetAudio(editing.id);
            setEditing(null);
            reload();
          }}
        />
      )}
    </Screen>
  );
}

function PageInfoSheet({ page, lessons, onClose, onSaved }: { page: PageRow; lessons: Lesson[]; onClose: () => void; onSaved: () => void }) {
  const [number, setNumber] = useState(page.page_number ? String(page.page_number) : "");
  const [lessonId, setLessonId] = useState(""); // "" = work it out from the page number
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = number.trim() ? Number(number) : null;
  const valid = n === null || (Number.isInteger(n) && n > 0);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await setPageInfo(page.id, n, lessonId || null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Sheet title="Page number and lesson" onClose={onClose}>
      <label className="block">
        <span className="text-sm font-medium">Printed page number</span>
        <input
          inputMode="numeric"
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/D/g, ""))}
          className="mt-1 min-h-12 w-full rounded-2xl border border-border bg-bg px-4 text-lg"
          placeholder="e.g. 13"
        />
      </label>
      <label className="mt-3 block">
        <span className="text-sm font-medium">Lesson</span>
        <select value={lessonId} onChange={(e) => setLessonId(e.target.value)} className="mt-1 min-h-12 w-full rounded-2xl border border-border bg-bg px-3">
          <option value="">Work it out from the page number</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title_en ?? l.title_ar}
              {l.start_page ? ` (p. ${l.start_page})` : ""}
            </option>
          ))}
        </select>
      </label>
      {error && <div className="mt-3"><ErrorNote error={error} /></div>}
      <Button className="mt-4 w-full" disabled={busy || !valid || (n === null && !lessonId)} onClick={save}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </Sheet>
  );
}
