// "Download for offline": loads everything the study screens show, using the
// same requests they make (so the service worker's saved copies match), and
// saves every audio clip on the phone. Scanning pages and creating practice
// still need internet; progress isn't saved while offline.
import { downloadClips, usageKey } from "./audio";
import { builtinCards } from "./builtin";
import {
  bookWordPool,
  classroomInstructions,
  lessonsOf,
  lessonWordCards,
  loadPageData,
  myClasses,
  nextLesson,
  pagesOf,
  practisedCardIds,
  previewRuns,
  savedCardIds,
  savedWords,
  cardsByIds,
} from "./data";
import { dueCardIds } from "./progress";

const READY_KEY = "rafiq:offlineReady";

export type OfflineReady = { at: string; clips: number; failed: number };

export function offlineReady(): OfflineReady | null {
  try {
    return JSON.parse(localStorage.getItem(READY_KEY) ?? "null");
  } catch {
    return null;
  }
}

export async function downloadForOffline(progress: (label: string, done: number, total: number) => void): Promise<OfflineReady> {
  // Ask the phone not to clear saved data when space runs low (best effort).
  await navigator.storage?.persist?.().catch(() => false);

  progress("Saving your lessons and pages", 0, 1);
  const [classes, builtins, saved] = await Promise.all([myClasses(), builtinCards(), savedWords(), savedCardIds(), practisedCardIds(), dueCardIds(20)]);
  await cardsByIds(saved.map((s) => s.card_id)); // My Words

  const keys: string[] = [...builtins.values()].map((c) => c.id); // letters, sounds, conversation
  for (const cls of classes) {
    const [{ lessons }, pages] = await Promise.all([lessonsOf(cls.book_id), pagesOf(cls.book_id)]);
    await Promise.all([classroomInstructions(cls.book_id), previewRuns(), bookWordPool(cls.book_id)]);
    for (const lesson of [lessons.find((l) => l.id === cls.current_lesson_id), nextLesson(lessons, cls.current_lesson_id)]) {
      if (lesson) await lessonWordCards(lesson.id, cls.book_id); // Tonight's Preview
    }
    for (const [i, p] of pages.entries()) {
      progress("Saving your lessons and pages", i, pages.length);
      const page = await loadPageData(cls.id, p.id);
      for (const card of page.cards) {
        keys.push(card.id);
        if (card.usage) keys.push(usageKey(card.id, "prompt"), usageKey(card.id, "response"));
      }
    }
  }

  const failed = await downloadClips(keys, (done, total) => progress("Saving audio", done, total));
  const ready = { at: new Date().toISOString(), clips: new Set(keys).size, failed: failed.length };
  try {
    localStorage.setItem(READY_KEY, JSON.stringify(ready));
  } catch {
    // fine: only the "last downloaded" note is lost
  }
  return ready;
}
