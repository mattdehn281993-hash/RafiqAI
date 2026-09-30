// My Words: every card the student saved, grouped by lesson (inside a class)
// and by built-in section (Letters & sounds, Conversation).
import { useEffect, useState } from "react";
import { useBase } from "../lib/base";
import { CardTile } from "../components/CardTile";
import { ErrorNote, Screen, Section, Spinner } from "../components/ui";
import { prepareAudio } from "../lib/audio";
import { cardsByIds, getClass, lessonsOf, savedWords, toggleSaved } from "../lib/data";
import { useAsync } from "../lib/useAsync";

export function Words() {
  const { classId } = useBase();
  const { data, error, loading, reload } = useAsync(async () => {
    const cls = classId ? await getClass(classId) : null;
    const saved = await savedWords();
    const [cards, lessons] = await Promise.all([
      cardsByIds(saved.map((s) => s.card_id)),
      cls ? lessonsOf(cls.book_id).then((r) => r.lessons) : Promise.resolve([]),
    ]);
    // This class's book cards plus built-in cards; without a class, built-in only.
    const mine = saved.filter((s) => {
      const book = cards.get(s.card_id)?.book_id;
      return book === null || (cls !== null && book === cls.book_id);
    });
    return { saved: mine, cards, lessons };
  }, [classId]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (data?.saved.length) prepareAudio(data.saved.map((s) => s.card_id)).catch(() => {});
  }, [data]);

  if (loading && !data) return <Screen title="My Words" classId={classId} learn><Spinner /></Screen>;
  if (error || !data) return <Screen title="My Words" classId={classId} learn><ErrorNote error={error ?? "Not found"} onRetry={reload} /></Screen>;

  const visible = data.saved.filter((s) => !removed.has(s.card_id));
  const groups = data.lessons
    .map((l) => ({ lesson: l, items: visible.filter((s) => s.lesson_id === l.id) }))
    .filter((g) => g.items.length > 0);
  const loose = visible.filter((s) => !s.lesson_id || !data.lessons.some((l) => l.id === s.lesson_id));
  const levelOf = (id: string) => data.cards.get(id)?.level ?? null;
  const builtinGroups = [
    { key: "letters", title: "Letters & sounds", items: loose.filter((s) => levelOf(s.card_id) === 1) },
    { key: "talk", title: "Conversation", items: loose.filter((s) => levelOf(s.card_id) === 4) },
    { key: "other", title: "Other", items: loose.filter((s) => ![1, 4].includes(levelOf(s.card_id) ?? -1)) },
  ].filter((g) => g.items.length > 0);

  async function unsave(cardId: string, lessonId: string | null) {
    setRemoved((r) => new Set([...r, cardId]));
    try {
      await toggleSaved(cardId, lessonId, true);
    } catch {
      setRemoved((r) => new Set([...r].filter((id) => id !== cardId)));
    }
  }

  return (
    <Screen title="My Words" subtitle={`${visible.length} saved`} classId={classId} learn>
      {visible.length === 0 && (
        <p className="mt-2 rounded-2xl bg-surface p-4 text-sm text-muted">
          Nothing saved yet. Tap <strong className="text-text">Save</strong> under any card (a letter sound, a greeting, or a word from your book) to keep it here for review.
        </p>
      )}
      {[
        ...groups.map((g) => ({ key: g.lesson.id, title: g.lesson.title_en ?? g.lesson.title_ar, items: g.items })),
        ...builtinGroups,
      ].map((g) => (
        <Section key={g.key} title={g.title}>
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
