// Copies the API keys the edge functions need from .env to Supabase Edge
// Function secrets. Values are never printed.
//
//   npm run secrets
const { SUPABASE_PROJECT_REF: ref, SUPABASE_ACCESS_TOKEN: token } = process.env;
const voiceIds = (process.env.ELEVENLABS_VOICE_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const secrets = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID || voiceIds[0],
  // Chosen after the audio spike; change here and run again to switch.
  ELEVENLABS_MODEL_ID: process.env.ELEVENLABS_MODEL_ID || "eleven_v3",
};
const missing = Object.entries(secrets).filter(([, v]) => !v).map(([k]) => k);
if (!ref || !token || missing.length) {
  console.error(`Missing in .env: ${[!ref && "SUPABASE_PROJECT_REF", !token && "SUPABASE_ACCESS_TOKEN", ...missing].filter(Boolean).join(", ")}`);
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify(Object.entries(secrets).map(([name, value]) => ({ name, value }))),
});
if (!res.ok) {
  console.error(`Setting secrets failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`Set ${Object.keys(secrets).join(", ")}`);
