// POST { card_ids?: [uuid, …], usage?: [{ card_id, part: "prompt" | "response" }, …] }
//   → { audio: { key: signed_url }, failed: { key: reason } }
// Keys are the card id, or "<card id>:prompt" / "<card id>:response" for the two
// lines of a card's speaking practice conversation.
// Audio is generated the first time a clip is needed, stored, and reused until
// the text changes (new text, new clip). Slow speed is the same file played at a
// lower rate in the app.
import * as z from "zod";
import { audioHash, modelFor, textToSpeech, voiceConfig } from "../_edge/elevenlabs.ts";
import { body, handle, HttpError, json } from "../_edge/http.ts";

const Body = z.object({
  card_ids: z.array(z.uuid()).max(60).default([]),
  usage: z.array(z.object({ card_id: z.uuid(), part: z.enum(["prompt", "response"]) })).max(60).default([]),
});
const BUCKET = "audio";
const URL_SECONDS = 60 * 60;

type CardRow = { id: string; kind: string; current_version: number; tts_text: string; audio_hash: string | null; usage: Record<string, string> | null };
/** One clip to voice: `update` remembers a card's own clip on its current version. */
type Clip = { key: string; text: string; kind: string; update?: { card_id: string; version: number; audio_hash: string | null } };

Deno.serve(handle(async (req, ctx) => {
  const input = await body(req, (raw) => Body.parse(raw));
  if (!input.card_ids.length && !input.usage.length) throw new HttpError(400, "Nothing to voice");
  const config = voiceConfig();
  const { voiceId } = config;

  // Row-level security decides which cards (and practice lines) the student may hear,
  // so only text from the app's own cards is ever voiced.
  const ids = [...new Set([...input.card_ids, ...input.usage.map((u) => u.card_id)])];
  const { data: rows, error } = await ctx.userClient
    .from("current_cards")
    .select("id, kind, current_version, tts_text, audio_hash, usage")
    .in("id", ids);
  if (error) throw error;
  const cards = new Map(((rows ?? []) as CardRow[]).map((c) => [c.id, c]));

  const clips: Clip[] = [];
  for (const id of input.card_ids) {
    const c = cards.get(id);
    if (c) clips.push({ key: c.id, text: c.tts_text, kind: c.kind, update: { card_id: c.id, version: c.current_version, audio_hash: c.audio_hash } });
  }
  for (const { card_id, part } of input.usage) {
    const text = cards.get(card_id)?.usage?.[`${part}_arabic`];
    if (text?.trim()) clips.push({ key: `${card_id}:${part}`, text, kind: "sentence" });
  }

  // Short items (letters, sounds, single words) and phrases use different models.
  const wanted = new Map<string, { hash: string; text: string; model: string; clips: Clip[] }>();
  for (const clip of clips) {
    const model = modelFor(config, clip.kind, clip.text);
    const hash = await audioHash(voiceId, model, clip.text);
    const entry = wanted.get(hash) ?? { hash, text: clip.text, model, clips: [] };
    entry.clips.push(clip);
    wanted.set(hash, entry);
  }

  const { data: existing, error: existingError } = wanted.size
    ? await ctx.admin.from("audio_files").select("hash, storage_path").in("hash", [...wanted.keys()])
    : { data: [], error: null };
  if (existingError) throw existingError;
  const paths = new Map<string, string>((existing ?? []).map((a) => [a.hash, a.storage_path]));

  const failed: Record<string, string> = {};
  const missing = [...wanted.values()].filter((w) => !paths.has(w.hash));
  await pool(missing, 2, async (w) => {
    try {
      const mp3 = await textToSpeech(voiceId, w.model, w.text);
      const path = `${w.hash}.mp3`;
      const up = await ctx.admin.storage.from(BUCKET).upload(path, mp3, { contentType: "audio/mpeg", upsert: true });
      if (up.error) throw up.error;
      const ins = await ctx.admin
        .from("audio_files")
        .upsert({ hash: w.hash, storage_path: path, voice_id: voiceId, model_id: w.model, source: "tts" }, { onConflict: "hash" });
      if (ins.error) throw ins.error;
      paths.set(w.hash, path);
    } catch (err) {
      for (const c of w.clips) failed[c.key] = err instanceof Error ? err.message : String(err);
    }
  });

  // Remember each card's own clip on its current version.
  for (const w of wanted.values()) {
    if (!paths.has(w.hash)) continue;
    for (const c of w.clips) {
      if (c.update && c.update.audio_hash !== w.hash) {
        await ctx.admin.from("card_versions").update({ audio_hash: w.hash }).eq("card_id", c.update.card_id).eq("version", c.update.version);
      }
    }
  }

  const ready = [...wanted.values()].filter((w) => paths.has(w.hash));
  const audio: Record<string, string> = {};
  if (ready.length) {
    const { data: signed, error: signError } = await ctx.admin.storage
      .from(BUCKET)
      .createSignedUrls(ready.map((w) => paths.get(w.hash)!), URL_SECONDS);
    if (signError) throw signError;
    ready.forEach((w, i) => {
      const url = signed?.[i]?.signedUrl;
      if (url) for (const c of w.clips) audio[c.key] = url;
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
