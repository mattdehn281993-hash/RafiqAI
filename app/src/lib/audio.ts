// Card audio: fetched once per card (signed URLs last an hour), one shared player.
// Slow speed is the same file at a lower playback rate, with pitch kept.
import { callFunction } from "./supabase";

const URL_LIFETIME_MS = 50 * 60 * 1000; // signed URLs last 60 min; refresh a little early
const SLOW_RATE = 0.7;

const urls = new Map<string, { url: string; at: number }>();
const player = typeof Audio === "undefined" ? null : new Audio();
if (player) player.preservesPitch = true;

type AudioResponse = { audio: Record<string, string>; failed: Record<string, string> };

/** Makes sure these cards have audio ready; returns the ids that failed. */
export async function prepareAudio(cardIds: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const needed = cardIds.filter((id) => {
    const hit = urls.get(id);
    return !hit || now - hit.at > URL_LIFETIME_MS;
  });
  if (needed.length === 0) return {};
  const failed: Record<string, string> = {};
  for (let i = 0; i < needed.length; i += 60) {
    const res = await callFunction<AudioResponse>("get-audio", { card_ids: needed.slice(i, i + 60) });
    for (const [id, url] of Object.entries(res.audio)) urls.set(id, { url, at: now });
    Object.assign(failed, res.failed);
  }
  return failed;
}

export async function playCard(cardId: string, slow = false): Promise<void> {
  if (!player) return;
  await prepareAudio([cardId]);
  const hit = urls.get(cardId);
  if (!hit) throw new Error("No audio for this card yet");
  player.pause();
  player.src = hit.url;
  player.defaultPlaybackRate = slow ? SLOW_RATE : 1;
  player.playbackRate = slow ? SLOW_RATE : 1;
  await player.play();
}

/** Drop a card's cached clip, e.g. after a correction changed what it says. */
export function forgetAudio(cardId: string) {
  urls.delete(cardId);
}

/** Plays a card and resolves when it has finished (for "play all"). */
export async function playCardToEnd(cardId: string, slow = false): Promise<void> {
  if (!player) return;
  await playCard(cardId, slow);
  await new Promise<void>((resolve) => {
    const done = () => {
      player.removeEventListener("ended", done);
      player.removeEventListener("pause", done);
      resolve();
    };
    player.addEventListener("ended", done);
    player.addEventListener("pause", done);
  });
}
