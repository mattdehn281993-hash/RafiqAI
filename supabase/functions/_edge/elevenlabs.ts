// ElevenLabs text-to-speech with retries on transient errors.
import { env } from "./http.ts";

export function voiceConfig() {
  return {
    voiceId: env("ELEVENLABS_VOICE_ID"),
    modelId: Deno.env.get("ELEVENLABS_MODEL_ID") || "eleven_v3",
  };
}

/** Storage key for a clip: the same voice, model and text always share one file. */
export async function audioHash(voiceId: string, modelId: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${voiceId}\n${modelId}\n${text.normalize("NFC")}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** MP3 bytes. 409 "already_running", 429 and 5xx are retried with backoff. */
export async function textToSpeech(voiceId: string, modelId: string, text: string): Promise<Uint8Array> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": env("ELEVENLABS_API_KEY"), "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: modelId }),
    });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    const retryable = res.status === 409 || res.status === 429 || res.status >= 500;
    if (retryable && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  }
}
