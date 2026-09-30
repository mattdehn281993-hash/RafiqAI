// End-to-end check of the deployed edge functions with a throwaway user and real
// textbook photos. Deletes the user and its book afterwards (audio clips stay:
// they are a shared cache).
//
//   npm run smoke            full run (~4 min, calls Claude and ElevenLabs)
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { ROTATIONS } from "../supabase/functions/_shared/orientation.ts";

const URL = process.env.SUPABASE_URL!;
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const PAGES = "spikes/page-reading/pages";
const photo = (id: string) => path.join(PAGES, fs.readdirSync(PAGES).find((f) => f.includes(id) && !f.includes("(1)"))!);

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

async function call(fn: string, body: unknown, token?: string) {
  const t = Date.now();
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, secs: ((Date.now() - t) / 1000).toFixed(1) };
}

async function upright(file: string, rotation: number, maxEdge = 2576) {
  const buf = await sharp(file).rotate().toBuffer();
  return (await sharp(buf).rotate(rotation).resize({ width: maxEdge, height: maxEdge, fit: "inside" }).jpeg({ quality: 90 }).toBuffer()).toString("base64");
}

const email = `smoke-${Date.now()}@rafiq.test`;
const password = crypto.randomUUID();
const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (createError) throw createError;
const userId = created.user.id;
let bookId: string | undefined;

try {
  const anon = createClient(URL, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const token = session.session!.access_token;

  const unauth = await call("detect-rotation", { candidates: [] });
  check("signed-out request is refused", unauth.status === 401, `status ${unauth.status}`);

  // Rotation: page 8 photo needs 90°.
  const small = await sharp(await sharp(photo("2446")).rotate().toBuffer()).resize({ width: 700, height: 700, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
  const candidates = await Promise.all(ROTATIONS.map(async (d) => (await sharp(small).rotate(d).jpeg({ quality: 80 }).toBuffer()).toString("base64")));
  const rot = await call("detect-rotation", { candidates }, token);
  check("detect-rotation turns page 8 upright", rot.json.rotation === 90, `${rot.json.rotation ?? rot.json.error}°, ${rot.secs}s`);

  // Book Map from the title + 3 contents pages (all need 270°).
  const tocImages = await Promise.all(["2436", "2441", "2442", "2443"].map((id) => upright(photo(id), 270, 2000)));
  const toc = await call("read-contents", { images: tocImages }, token);
  const lessons = toc.json.map?.units?.flatMap((u: { lessons: unknown[] }) => u.lessons) ?? [];
  check("read-contents builds the Book Map", toc.status === 200 && lessons.length >= 60, `${lessons.length} rows, ${toc.secs}s${toc.json.error ? ", " + toc.json.error : ""}`);
  if (toc.status !== 200) throw new Error("Cannot continue without a Book Map");

  const cls = await call("create-class", { class_name: "Smoke test class", map: toc.json.map }, token);
  check("create-class saves book, lessons and class", cls.status === 200 && !!cls.json.class_id, `${cls.secs}s${cls.json.error ? ", " + cls.json.error : ""}`);
  const classId = cls.json.class_id;
  const { data: classRow } = await anon.from("classes").select("book_id, current_lesson_id").eq("id", classId).single();
  bookId = classRow?.book_id;

  const outsider = await call("explain-page", { class_id: crypto.randomUUID(), image: "x".repeat(2000) }, token);
  check("explain-page refuses a class you're not in", outsider.status === 403, `status ${outsider.status}`);

  // Page 8.
  const page = await call("explain-page", { class_id: classId, image: await upright(photo("2446"), 90) }, token);
  const items = page.json.extraction?.items ?? [];
  check("explain-page reads page 8", page.status === 200 && items.length >= 6, `${items.length} items, ${page.secs}s${page.json.error ? ", " + page.json.error : ""}`);

  const saved = await call("save-page", {
    class_id: classId, lesson_id: classRow?.current_lesson_id, extraction: page.json.extraction,
    model: page.json.model, prompt_version: page.json.promptVersion,
  }, token);
  check("save-page stores the checked page", saved.status === 200 && !!saved.json.page_id, `${saved.secs}s${saved.json.error ? ", " + saved.json.error : ""}`);
  const again = await call("save-page", {
    class_id: classId, lesson_id: null, extraction: page.json.extraction, model: "m", prompt_version: "v",
  }, token);
  check("the same page can't be saved twice", again.status === 409 || !page.json.extraction?.page_number, `status ${again.status}`);

  const { data: pageCards } = await anon.from("page_cards").select("card_id, position").eq("page_id", saved.json.page_id).order("position");
  check("cards readable by the student through RLS", (pageCards?.length ?? 0) === items.length, `${pageCards?.length} cards`);

  const cardIds = (pageCards ?? []).map((c) => c.card_id);
  const audio = await call("get-audio", { card_ids: cardIds }, token);
  const urls = Object.values(audio.json.audio ?? {}) as string[];
  check("get-audio returns a clip for every card", urls.length === cardIds.length, `${urls.length}/${cardIds.length}, ${audio.secs}s${Object.keys(audio.json.failed ?? {}).length ? ", failed: " + JSON.stringify(audio.json.failed) : ""}`);
  const again2 = await call("get-audio", { card_ids: cardIds }, token);
  check("second request comes from the cache", Object.keys(again2.json.audio ?? {}).length === cardIds.length && Number(again2.secs) < Number(audio.secs), `${again2.secs}s vs ${audio.secs}s`);
  if (urls[0]) {
    const clip = await fetch(urls[0]);
    const bytes = (await clip.arrayBuffer()).byteLength;
    check("signed audio URL plays (MP3 bytes)", clip.ok && bytes > 2000, `${bytes} bytes`);
  }
} finally {
  if (bookId) {
    await admin.from("classes").delete().eq("book_id", bookId);
    await admin.from("books").delete().eq("id", bookId);
  }
  await admin.auth.admin.deleteUser(userId);
  console.log("cleaned up test user and book");
}

console.log(failures ? `\n${failures} FAILED` : "\nAll smoke checks passed");
process.exit(failures ? 1 : 0);
