// POST { card_ids: [uuid, …] } → { audio: { card_id: signed_url }, failed: { card_id: reason } }
// Audio is generated the first time a card needs it, stored, and reused until the
// card is corrected (a new version has new text, so a new clip). Slow speed is
// the same file played at a lower rate in the app.
import * as z from "zod";
import { audioHash, textToSpeech, voiceConfig } from "../_edge/elevenlabs.ts";
import { body, handle, json } from "../_edge/http.ts";

const Body = z.object({ card_ids: z.array(z.uuid()).min(1).max(60) });
const BUCKET = "audio";
const URL_SECONDS = 60 * 60;

type CardRow = { id: string; current_version: number; tts_text: string; audio_hash: string | null };

Deno.serve(handle(async (req, ctx) => {
  const { card_ids } = await body(req, (raw) => Body.parse(raw));
  const { voiceId, modelId } = voiceConfig();

  // Row-level security decides which of these cards the student may hear.
  const { data: cards, error } = await ctx.userClient
    .from("current_cards")
    .select("id, current_version, tts_text, audio_hash")
    .in("id", card_ids);
  if (error) throw error;

  const wanted = new Map<string, { hash: string; text: string; cards: CardRow[] }>();
  for (const card of (cards ?? []) as CardRow[]) {
    const hash = await audioHash(voiceId, modelId, card.tts_text);
    const entry = wanted.get(hash) ?? { hash, text: card.tts_text, cards: [] };
    entry.cards.push(card);
    wanted.set(hash, entry);
  }

  const { data: existing, error: existingError } = await ctx.admin
    .from("audio_files")
    .select("hash, storage_path")
    .in("hash", [...wanted.keys()]);
  if (existingError) throw existingError;
  const paths = new Map<string, string>((existing ?? []).map((a) => [a.hash, a.storage_path]));

  const failed: Record<string, string> = {};
  const missing = [...wanted.values()].filter((w) => !paths.has(w.hash));
  await pool(missing, 2, async (w) => {
    try {
      const mp3 = await textToSpeech(voiceId, modelId, w.text);
      const path = `${w.hash}.mp3`;
      const up = await ctx.admin.storage.from(BUCKET).upload(path, mp3, { contentType: "audio/mpeg", upsert: true });
      if (up.error) throw up.error;
      const ins = await ctx.admin
        .from("audio_files")
        .upsert({ hash: w.hash, storage_path: path, voice_id: voiceId, model_id: modelId, source: "tts" }, { onConflict: "hash" });
      if (ins.error) throw ins.error;
      paths.set(w.hash, path);
    } catch (err) {
      for (const c of w.cards) failed[c.id] = err instanceof Error ? err.message : String(err);
    }
  });

  // Remember each card's clip on its current version.
  for (const w of wanted.values()) {
    if (!paths.has(w.hash)) continue;
    for (const c of w.cards.filter((c) => c.audio_hash !== w.hash)) {
      await ctx.admin.from("card_versions").update({ audio_hash: w.hash }).eq("card_id", c.id).eq("version", c.current_version);
    }
  }

  const hashes = [...wanted.values()].filter((w) => paths.has(w.hash));
  const audio: Record<string, string> = {};
  if (hashes.length) {
    const { data: signed, error: signError } = await ctx.admin.storage
      .from(BUCKET)
      .createSignedUrls(hashes.map((w) => paths.get(w.hash)!), URL_SECONDS);
    if (signError) throw signError;
    hashes.forEach((w, i) => {
      const url = signed?.[i]?.signedUrl;
      if (url) for (const c of w.cards) audio[c.id] = url;
    });
  }

  return json({ audio, failed });
}));

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
    }),
  );
}
