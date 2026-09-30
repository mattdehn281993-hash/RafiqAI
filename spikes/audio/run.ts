// Phase 0 audio spike: voice every test item with each candidate voice and
// model, then build a listening report with pass/fail buttons.
//
//   npm run spike:audio                                   voices from ELEVENLABS_VOICE_IDS
//   npm run spike:audio -- --models eleven_v3             try one model only
//   npm run spike:audio -- --only syl                     only items whose id starts with "syl"
//
// Clips are cached in out/<voice>/<model>/, so re-running only generates what's missing.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { getVoice, textToSpeech } from "./elevenlabs.ts";
import { AUDIO_ITEMS, type AudioItem } from "./items.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "out");

const { values: args } = parseArgs({
  options: {
    models: { type: "string", default: "eleven_multilingual_v2,eleven_v3" },
    only: { type: "string" },
    concurrency: { type: "string", default: "2" },
  },
});

type Column = { voiceId: string; voiceName: string; model: string };

async function main() {
  const voiceIds = (process.env.ELEVENLABS_VOICE_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (voiceIds.length === 0) {
    console.error("ELEVENLABS_VOICE_IDS is empty. Run `npm run spike:voices` to find voice IDs, add them to .env, then run again.");
    process.exit(1);
  }
  const models = args.models.split(",").map((s) => s.trim()).filter(Boolean);
  const items = args.only ? AUDIO_ITEMS.filter((i) => i.id.startsWith(args.only!)) : AUDIO_ITEMS;

  const columns: Column[] = [];
  for (const voiceId of voiceIds) {
    const voiceName = await getVoice(voiceId).then((v) => v.name, () => voiceId);
    for (const model of models) columns.push({ voiceId, voiceName, model });
  }

  const jobs = columns.flatMap((col) => items.map((item) => ({ col, item })));
  let made = 0;
  let cached = 0;
  const failures: string[] = [];
  await pool(jobs, Number(args.concurrency), async ({ col, item }) => {
    const file = clipPath(col, item);
    if (await exists(file)) {
      cached++;
      return;
    }
    try {
      const mp3 = await textToSpeech(col.voiceId, item.text, col.model);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, mp3);
      made++;
      if (made % 20 === 0) console.log(`  ${made} clips generated…`);
    } catch (err) {
      failures.push(`${col.voiceName} / ${col.model} / ${item.id}: ${err instanceof Error ? err.message : err}`);
    }
  });

  console.log(`\n${made} new clips, ${cached} from cache, ${failures.length} failed.`);
  for (const f of failures.slice(0, 10)) console.log(`  ✗ ${f}`);

  const report = path.join(OUT_DIR, "report.html");
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(report, buildReport(columns, items));
  console.log(`Report: ${report}`);
}

function clipPath(col: Column, item: AudioItem) {
  return path.join(OUT_DIR, col.voiceId, col.model, `${item.id}.mp3`);
}

async function exists(file: string) {
  return fs.stat(file).then(() => true, () => false);
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  });
  await Promise.all(workers);
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function buildReport(columns: Column[], items: AudioItem[]): string {
  const head = columns.map((c) => `<th>${esc(c.voiceName)}<br><span class="muted">${esc(c.model)}</span></th>`).join("");
  let group = "";
  const rows = items
    .map((item) => {
      const groupRow =
        item.group !== group ? `<tr class="group"><th colspan="${columns.length + 2}">${esc((group = item.group))}</th></tr>` : "";
      const cells = columns
        .map((c) => {
          const rel = `${c.voiceId}/${c.model}/${item.id}.mp3`;
          const key = `${c.voiceId}/${c.model}/${item.id}`;
          return `<td><div class="clip" data-key="${esc(key)}" data-item="${esc(item.id)}" data-col="${esc(c.voiceName + " / " + c.model)}">
            <button class="play" data-src="${esc(rel)}" aria-label="Play">▶</button>
            <button class="verdict pass" data-v="pass" aria-label="Sounds right">✓</button>
            <button class="verdict fail" data-v="fail" aria-label="Sounds wrong">✗</button>
          </div></td>`;
        })
        .join("");
      return `${groupRow}<tr><td><span class="ar" lang="ar" dir="rtl">${esc(item.text)}</span></td><td><strong>${esc(item.pron)}</strong><br><span class="muted">${esc(item.english)}</span></td>${cells}</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Audio Spike</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600&display=swap" rel="stylesheet">
<style>
:root { --bg: #f7f5f0; --surface: #fff; --text: #1d1b16; --muted: #6b665c; --border: #e2ddd2; --pass: #2f7d4f; --fail: #b3261e; --accent: #2f5d50; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #15140f; --surface: #1f1d17; --text: #efeadf; --muted: #a39d90; --border: #37332a; --pass: #7fd19b; --fail: #f4a79e; --accent: #8cc7b5; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1300px; margin: 0 auto; padding: 24px 16px 80px; }
h1 { font-size: 22px; margin: 0 0 8px; }
.muted { color: var(--muted); font-size: 12px; font-weight: 400; }
.bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 12px 0 20px; }
.wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: middle; }
thead th { position: sticky; top: 0; background: var(--surface); z-index: 1; }
tr.group th { background: var(--bg); font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.ar { font-family: "Noto Naskh Arabic", "Traditional Arabic", serif; font-size: 28px; }
.clip { display: flex; gap: 4px; }
button { font: inherit; min-width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; }
.clip[data-v="pass"] .pass { background: var(--pass); color: var(--surface); border-color: var(--pass); }
.clip[data-v="fail"] .fail { background: var(--fail); color: var(--surface); border-color: var(--fail); }
.primary { background: var(--accent); border-color: var(--accent); color: var(--surface); padding: 0 14px; }
</style>
</head>
<body>
<main>
  <h1>Audio Spike</h1>
  <p class="muted">Play each clip and mark it ✓ if it sounds exactly like the pronunciation beside it in Modern Standard Arabic, ✗ if not. Any syllable that fails with every voice goes on the native-recording list. Marks are saved in this browser.</p>
  <div class="bar">
    <label><input type="checkbox" id="slow"> Play slow (0.7×)</label>
    <span id="tally" class="muted"></span>
    <button type="button" class="primary" id="export">Copy results</button>
  </div>
  <div class="wrap">
  <table>
    <thead><tr><th>Arabic</th><th>Should sound like</th>${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </div>
</main>
<script>
(() => {
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const audio = new Audio();
  audio.preservesPitch = true;
  const slow = document.getElementById("slow");
  const clips = [...document.querySelectorAll(".clip")];
  const tally = () => {
    const pass = clips.filter((c) => c.dataset.v === "pass").length;
    const fail = clips.filter((c) => c.dataset.v === "fail").length;
    document.getElementById("tally").textContent = pass + " pass · " + fail + " fail · " + (clips.length - pass - fail) + " not yet heard";
  };
  for (const clip of clips) {
    const saved = store.get("audio:" + clip.dataset.key);
    if (saved) clip.dataset.v = saved;
    clip.querySelector(".play").addEventListener("click", (e) => {
      audio.src = e.currentTarget.dataset.src;
      audio.playbackRate = slow.checked ? 0.7 : 1;
      audio.play();
    });
    for (const b of clip.querySelectorAll(".verdict")) {
      b.addEventListener("click", () => {
        clip.dataset.v = b.dataset.v;
        store.set("audio:" + clip.dataset.key, b.dataset.v);
        tally();
      });
    }
  }
  tally();
  document.getElementById("export").addEventListener("click", async (e) => {
    const results = clips.filter((c) => c.dataset.v).map((c) => ({ item: c.dataset.item, voice: c.dataset.col, verdict: c.dataset.v }));
    const text = JSON.stringify(results, null, 2);
    try { await navigator.clipboard.writeText(text); e.target.textContent = "Copied"; }
    catch { prompt("Copy these results:", text); }
  });
})();
</script>
</body>
</html>`;
}

await main();
