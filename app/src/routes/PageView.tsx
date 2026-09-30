// A saved page: every card in the page's own layout (rows, right to left).
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { CardTile } from "../components/CardTile";
import { ErrorNote, Screen, Spinner } from "../components/ui";
import { prepareAudio } from "../lib/audio";
import { pageCards, rowsOf, savedCardIds, toggleSaved } from "../lib/data";
import { supabase } from "../lib/supabase";
import type { PageRow } from "../lib/types";
import { must, useAsync } from "../lib/useAsync";

/** Full width for single-item rows and long text; half width otherwise (page layout, right to left). */
const wide = (row: { arabic_full: string }[], c: { arabic_full: string }) => row.length === 1 || c.arabic_full.length > 24;

export function PageView() {
  const { classId = "", pageId = "" } = useParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const page = must(await supabase.from("pages").select("id, lesson_id, page_number, page_kind, summary, scanned_at").eq("id", pageId).single()) as PageRow;
    const lesson = page.lesson_id
      ? (must(await supabase.from("lessons").select("title_en, title_ar").eq("id", page.lesson_id).single()) as { title_en: string | null; title_ar: string })
      : null;
    const [cards, saved] = await Promise.all([pageCards(pageId), savedCardIds()]);
    return { page, lesson, cards, saved };
  }, [pageId]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [audioError, setAudioError] = useState<string | null>(null);

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
      {page.summary && <p className="text-sm text-muted">{page.summary}</p>}
      <p className="mt-1 text-xs text-muted">Tap a card to hear it. Light vowel marks were added by Rafiq.</p>
      {audioError && <p className="mt-2 rounded-xl bg-warn-bg p-2 text-sm text-warn">{audioError}</p>}

      <div className="mt-3 flex flex-col gap-2">
        {rowsOf(cards).map((row, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 [&>*]:min-w-0" dir="rtl">
            {row.map((c) => (
              <div key={c.id} dir="ltr" className={`flex min-w-0 ${wide(row, c) ? "col-span-2" : ""}`}>
                <CardTile card={c} saved={saved.has(c.id)} onToggleSave={() => toggle(c.id)} compact={!wide(row, c)} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Screen>
  );
}
