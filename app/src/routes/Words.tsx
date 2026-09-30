// My Words: every card the student saved, grouped by lesson.
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { CardTile } from "../components/CardTile";
import { ErrorNote, Screen, Section, Spinner } from "../components/ui";
import { prepareAudio } from "../lib/audio";
import { cardsByIds, getClass, lessonsOf, toggleSaved } from "../lib/data";
import { supabase } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";

export function Words() {
  const { classId = "" } = useParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const cls = await getClass(classId);
    const saved = must(await supabase.from("saved_words").select("card_id, lesson_id, saved_at").order("saved_at", { ascending: false })) as {
      card_id: string;
      lesson_id: string | null;
      saved_at: string;
    }[];
    const [cards, { lessons }] = await Promise.all([cardsByIds(saved.map((s) => s.card_id)), lessonsOf(cls.book_id)]);
    return { saved: saved.filter((s) => cards.get(s.card_id)?.book_id === cls.book_id || cards.get(s.card_id)?.book_id === null), cards, lessons };
  }, [classId]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (data?.saved.length) prepareAudio(data.saved.map((s) => s.card_id)).catch(() => {});
  }, [data]);

  if (loading && !data) return <Screen title="My Words" classId={classId}><Spinner /></Screen>;
  if (error || !data) return <Screen title="My Words" classId={classId}><ErrorNote error={error ?? "Not found"} onRetry={reload} /></Screen>;

  const visible = data.saved.filter((s) => !removed.has(s.card_id));
  const groups = data.lessons
    .map((l) => ({ lesson: l, items: visible.filter((s) => s.lesson_id === l.id) }))
    .filter((g) => g.items.length > 0);
  const loose = visible.filter((s) => !s.lesson_id || !data.lessons.some((l) => l.id === s.lesson_id));

  async function unsave(cardId: string, lessonId: string | null) {
    setRemoved((r) => new Set([...r, cardId]));
    try {
      await toggleSaved(cardId, lessonId, true);
    } catch {
      setRemoved((r) => new Set([...r].filter((id) => id !== cardId)));
    }
  }

  return (
    <Screen title="My Words" subtitle={`${visible.length} saved`} classId={classId}>
      {visible.length === 0 && (
        <p className="mt-2 rounded-2xl bg-surface p-4 text-sm text-muted">
          Nothing saved yet. On any page, tap <strong className="text-text">Save</strong> under a card to keep it here for review.
        </p>
      )}
      {[...groups, ...(loose.length ? [{ lesson: null, items: loose }] : [])].map((g) => (
        <Section key={g.lesson?.id ?? "other"} title={g.lesson?.title_en ?? g.lesson?.title_ar ?? "Other"}>
          <div className="flex flex-col gap-2">
            {g.items.map((s) => {
              const card = data.cards.get(s.card_id);
              return card ? <CardTile key={s.card_id} card={card} saved onToggleSave={() => unsave(s.card_id, s.lesson_id)} /> : null;
            })}
          </div>
        </Section>
      ))}
    </Screen>
  );
}
