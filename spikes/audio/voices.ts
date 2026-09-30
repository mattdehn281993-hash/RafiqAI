// Lists the voices in your ElevenLabs library so you can pick IDs for
// ELEVENLABS_VOICE_IDS in .env.
//
//   npm run spike:voices              all voices in your library
//   npm run spike:voices -- arabic    only voices matching "arabic"
import { listVoices } from "./elevenlabs.ts";

const search = process.argv[2];
const voices = await listVoices(search);

if (voices.length === 0) {
  console.log(search ? `No voices in your library match "${search}".` : "Your ElevenLabs library is empty.");
} else {
  for (const v of voices) {
    const labels = Object.entries(v.labels ?? {})
      .map(([k, val]) => `${k}: ${val}`)
      .join(", ");
    console.log(`${v.voice_id}  ${v.name}${v.category ? ` [${v.category}]` : ""}${labels ? `  (${labels})` : ""}`);
  }
}

console.log(`
To find Fusha voices: open https://elevenlabs.io/app/voice-library, filter Language = Arabic,
listen for Modern Standard Arabic (not Egyptian or Gulf), and add 2–3 candidates to your library.
Then run this again and put their IDs in .env as ELEVENLABS_VOICE_IDS=id1,id2,id3`);
