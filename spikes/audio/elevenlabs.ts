// Minimal ElevenLabs REST client for the spike.
const BASE = "https://api.elevenlabs.io";

function key(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) {
    console.error("ELEVENLABS_API_KEY is empty. Add it to the .env file in the project root, then run again.");
    process.exit(1);
  }
  return k;
}

/** 409 "already_running", 429 and 5xx are transient; retry them with backoff. */
const RETRYABLE = (status: number) => status === 409 || status === 429 || status >= 500;

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { "xi-api-key": key(), "content-type": "application/json", ...init.headers },
    });
    if (res.ok) return res;
    if (RETRYABLE(res.status) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`ElevenLabs ${res.status} on ${path}: ${await res.text()}`);
  }
}

export type Voice = {
  voice_id: string;
  name: string;
  category?: string;
  description?: string | null;
  labels?: Record<string, string>;
  preview_url?: string | null;
};

export async function listVoices(search?: string): Promise<Voice[]> {
  const voices: Voice[] = [];
  let token: string | undefined;
  do {
    const q = new URLSearchParams({ page_size: "100" });
    if (search) q.set("search", search);
    if (token) q.set("next_page_token", token);
    const body = (await (await call(`/v2/voices?${q}`)).json()) as {
      voices: Voice[];
      has_more: boolean;
      next_page_token?: string | null;
    };
    voices.push(...body.voices);
    token = body.has_more ? (body.next_page_token ?? undefined) : undefined;
  } while (token);
  return voices;
}

export async function getVoice(voiceId: string): Promise<Voice> {
  return (await call(`/v1/voices/${voiceId}`)).json() as Promise<Voice>;
}

/** Returns MP3 bytes. */
export async function textToSpeech(voiceId: string, text: string, modelId: string): Promise<Buffer> {
  const res = await call(`/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    body: JSON.stringify({ text, model_id: modelId }),
  });
  return Buffer.from(await res.arrayBuffer());
}
