// Voices every built-in course card in advance (through the get-audio function,
// so clips land in the shared cache exactly as the app would make them). Run
// after adding built-in cards or changing the voice/model. Uses a throwaway user.
//
//   npm run audio:builtin
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const email = `audio-${Date.now()}@rafiq.test`;
const password = crypto.randomUUID();
const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;

try {
  const anon = createClient(URL, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const { data: cards, error: cardsError } = await anon.from("current_cards").select("id, audio_hash").is("book_id", null);
  if (cardsError) throw cardsError;
  const ids = cards.map((c) => c.id);
  console.log(`${ids.length} built-in cards, ${cards.filter((c) => c.audio_hash).length} already voiced`);

  let ok = 0;
  const failed: string[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const t = Date.now();
    const res = await fetch(`${URL}/functions/v1/get-audio`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${session.session!.access_token}` },
      body: JSON.stringify({ card_ids: ids.slice(i, i + 30) }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`get-audio ${res.status}: ${JSON.stringify(json)}`);
    ok += Object.keys(json.audio).length;
    failed.push(...Object.entries(json.failed).map(([id, why]) => `${id}: ${why}`));
    console.log(`  ${Math.min(i + 30, ids.length)}/${ids.length} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  }
  console.log(`${ok} cards have audio, ${failed.length} failed${failed.length ? ":\n" + failed.slice(0, 5).join("\n") : ""}`);
} finally {
  await admin.auth.admin.deleteUser(created.user.id);
}
