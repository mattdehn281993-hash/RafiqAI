// A saved page: every card in the page's own layout (rows, right to left).
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { CorrectCardSheet, Sheet } from "../components/CardEditor";
import { CardTile } from "../components/CardTile";
import { Button, ErrorNote, Screen, Spinner } from "../components/ui";
import { forgetAudio, prepareAudio } from "../lib/audio";
import { correctCard, getClass, lessonsOf, pageCards, rowsOf, savedCardIds, setPageInfo, toggleSaved } from "../lib/data";
import { supabase } from "../lib/supabase";
import type { Lesson, PageRow, PlacedCard } from "../lib/types";
import { must, useAsync } from "../lib/useAsync";

/** Full width for single-item rows and long text; half width otherwise (page layout, right to left). */
const wide = (row: { arabic_full: string }[], c: { arabic_full: string }) => row.length === 1 || c.arabic_full.length > 24;

export function PageView() {
  const { classId = "", pageId = "" } = useParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const page = must(await supabase.from("pages").select("id, book_id, lesson_id, page_number, page_kind, summary, scanned_at").eq("id", pageId).single()) as PageRow & { book_id: string };
    const lesson = page.lesson_id
      ? (must(await supabase.from("lessons").select("title_en, title_ar").eq("id", page.lesson_id).single()) as { title_en: string | null; title_ar: string })
      : null;
    const [cards, saved, cls, map] = await Promise.all([pageCards(pageId), savedCardIds(), getClass(classId), lessonsOf(page.book_id)]);
    return { page, lesson, cards, saved, editor: cls.role === "editor", lessons: map.lessons };
  }, [pageId]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [audioError, setAudioError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlacedCard | null>(null);
  const [editingPage, setEditingPage] = useState(false);

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
      <p className="mt-1 text-xs text-muted">Tap a card to hear it. Light vowel marks were added by Rafiq.</p>
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
          onClose={() => setEditing(null)}
          onSave={async (changes, reason) => {
            await correctCard(editing.id, changes, reason);
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
