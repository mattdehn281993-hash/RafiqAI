// Audio for cards and speaking practice lines, with one shared player.
// Every clip that is played or prepared is also saved on the phone (Cache
// Storage), so it plays again without internet. Clips are named by content hash
// on the server, so a saved clip never goes stale; a corrected card simply
// points at a new clip. Slow speed is the same file at a lower rate, pitch kept.
import { callFunction } from "./supabase";

const URL_LIFETIME_MS = 50 * 60 * 1000; // signed URLs last 60 min; refresh a little early
const SLOW_RATE = 0.7;
const CACHE = "rafiq-audio";
const PATHS_KEY = "rafiq:clipPaths";

/** Key for one line of a card's speaking practice conversation. */
export const usageKey = (cardId: string, part: "prompt" | "response") => `${cardId}:${part}`;

const signed = new Map<string, { url: string; at: number }>(); // key → signed URL (online only)
const blobUrls = new Map<string, string>(); // clip path → object URL for this session
let paths: Record<string, string> = {}; // key → clip path (stable, survives restarts)
try {
  paths = JSON.parse(localStorage.getItem(PATHS_KEY) ?? "{}");
} catch {
  paths = {};
}
const savePaths = () => {
  try {
    localStorage.setItem(PATHS_KEY, JSON.stringify(paths));
  } catch {
    // storage full or blocked: clips still play online
  }
};

const player = typeof Audio === "undefined" ? null : new Audio();
if (player) player.preservesPitch = true;

type AudioResponse = { audio: Record<string, string>; failed: Record<string, string> };

/** The signed URL without its token: the same clip always has the same path. */
const pathOf = (url: string) => {
  const u = new URL(url);
  return u.origin + u.pathname;
};

// Open the phone's clip storage once and reuse it: opening it for every clip at
// the same time makes browsers fail with "Unexpected internal error".
let clipStore: Promise<Cache> | null = null;
function store(): Promise<Cache> {
  clipStore ??= caches.open(CACHE).catch((err) => {
    clipStore = null; // try again next time
    throw err;
  });
  return clipStore;
}

async function fromPhone(path: string): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  const hit = await (await store()).match(path);
  return hit ? hit.blob() : null;
}

async function saveOnPhone(path: string, blob: Blob) {
  if (typeof caches === "undefined") return;
  const response = () => new Response(blob, { headers: { "content-type": "audio/mpeg" } });
  try {
    await (await store()).put(path, response());
  } catch {
    await (await store()).put(path, response()); // one retry
  }
}

/** Is this clip already saved on the phone? */
async function isSaved(key: string): Promise<boolean> {
  const path = paths[key];
  return !!path && (blobUrls.has(path) || !!(await fromPhone(path)));
}

/** Ask the server for signed URLs (creating clips it has never made). */
async function sign(keys: string[]): Promise<Record<string, string>> {
  const failed: Record<string, string> = {};
  const now = Date.now();
  for (let i = 0; i < keys.length; i += 60) {
    const batch = keys.slice(i, i + 60);
    const card_ids = batch.filter((k) => !k.includes(":"));
    const usage = batch.filter((k) => k.includes(":")).map((k) => {
      const [card_id, part] = k.split(":");
      return { card_id, part };
    });
    const res = await callFunction<AudioResponse>("get-audio", { card_ids, usage });
    for (const [key, url] of Object.entries(res.audio)) {
      signed.set(key, { url, at: now });
      paths[key] = pathOf(url);
    }
    Object.assign(failed, res.failed);
  }
  savePaths();
  return failed;
}

async function download(key: string): Promise<string> {
  const s = signed.get(key);
  if (!s) throw new Error("No audio for this yet");
  const res = await fetch(s.url);
  if (!res.ok) throw new Error(`Audio download failed (${res.status})`);
  const blob = await res.blob();
  const path = pathOf(s.url);
  await saveOnPhone(path, blob).catch((err) => console.warn("rafiq: could not save clip", path.slice(-20), err?.name, err?.message));
  const url = URL.createObjectURL(blob);
  blobUrls.set(path, url);
  return url;
}

/** A playable URL for a clip: from the phone if saved, otherwise downloaded (and saved). */
async function playable(key: string): Promise<string> {
  const path = paths[key];
  if (path) {
    const inMemory = blobUrls.get(path);
    if (inMemory) return inMemory;
    const blob = await fromPhone(path);
    if (blob) {
      const url = URL.createObjectURL(blob);
      blobUrls.set(path, url);
      return url;
    }
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("You're offline and this audio isn't saved on the phone yet");
  }
  const s = signed.get(key);
  if (!s || Date.now() - s.at > URL_LIFETIME_MS) await sign([key]);
  return download(key);
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
    }),
  );
}

/**
 * Save clips on the phone for offline use. Reports progress as clips finish;
 * returns the keys that couldn't be saved.
 */
export async function downloadClips(keys: string[], onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const unique = [...new Set(keys)];
  const missing: string[] = [];
  for (const k of unique) if (!(await isSaved(k))) missing.push(k);
  let done = unique.length - missing.length;
  onProgress?.(done, unique.length);
  if (!missing.length) return [];

  const failed = new Set(Object.keys(await sign(missing)));
  await pool(missing.filter((k) => !failed.has(k)), 4, async (k) => {
    try {
      await download(k);
    } catch {
      failed.add(k);
    }
    onProgress?.(++done, unique.length);
  });
  return [...failed];
}

/**
 * Get clips ready so taps play instantly, and save them on the phone in the
 * background. Returns the keys that failed (offline and not saved counts as failed).
 */
export async function prepareClips(keys: string[]): Promise<Record<string, string>> {
  const need: string[] = [];
  for (const k of new Set(keys)) if (!(await isSaved(k))) need.push(k);
  if (!need.length) return {};
  if (navigator.onLine === false) return Object.fromEntries(need.map((k) => [k, "offline"]));
  const failed = await sign(need);
  void pool(need.filter((k) => !failed[k]), 3, async (k) => {
    await download(k).catch(() => {});
  });
  return failed;
}

/** Cards' own audio (kept for existing callers). */
export const prepareAudio = (cardIds: string[]) => prepareClips(cardIds);

export async function playClip(key: string, slow = false): Promise<void> {
  if (!player) return;
  const url = await playable(key);
  player.pause();
  player.src = url;
  player.defaultPlaybackRate = slow ? SLOW_RATE : 1;
  player.playbackRate = slow ? SLOW_RATE : 1;
  await player.play();
}

export const playCard = (cardId: string, slow = false) => playClip(cardId, slow);

/** Plays a clip and resolves when it has finished (for "play all"). */
export async function playClipToEnd(key: string, slow = false): Promise<void> {
  if (!player) return;
  await playClip(key, slow);
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

export const playCardToEnd = (cardId: string, slow = false) => playClipToEnd(cardId, slow);

/** A card's text changed (correction or new practice): look its clips up again. */
export function forgetAudio(cardId: string) {
  for (const key of [cardId, usageKey(cardId, "prompt"), usageKey(cardId, "response")]) {
    signed.delete(key);
    delete paths[key];
  }
  savePaths();
}
