// Builds a self-contained HTML report for one spike run: each page photo next
// to its cards, AI-added vowel marks shown lighter, and the Gate 1 checklist.
import type { ExplainPageResult } from "../../shared/explain-page.ts";
import type { PageItem } from "../../shared/card-schema.ts";
import { diffMarks, printedOnly, skeleton, MARK_NAMES, type MarkDiff } from "../../shared/harakat.ts";

export type PageRecord =
  | { name: string; source: string; image: string; width: number; height: number; rotation?: number; ok: true; result: ExplainPageResult }
  | { name: string; source: string; image: string | null; ok: false; error: string };

// claude-opus-5, $ per million tokens
const PRICE = { input: 5, output: 25 };

const GATE_1 = [
  "Every Arabic item on the page is captured",
  "Right-to-left reading order is kept",
  "English meanings are correct",
  "The book's own vowel marks are preserved; AI-added marks are flagged",
  "Easy pronunciation matches the Arabic (audio is tested in the audio spike)",
  "Unclear text is flagged \"Needs checking\", never guessed",
];

const SPOKEN_KINDS = new Set(["word", "phrase", "sentence", "instruction", "heading"]);

type ItemAnalysis = {
  item: PageItem;
  diff: MarkDiff;
  ttsLettersDiffer: boolean;
};

function analyse(item: PageItem): ItemAnalysis {
  const diff = diffMarks(item.arabic_printed, item.arabic_full);
  // Pause form may turn a final ة into ه; anything else changing is suspicious.
  const norm = (s: string) => skeleton(s).replace(/ة/g, "ه");
  const ttsLettersDiffer = SPOKEN_KINDS.has(item.kind) && norm(item.tts_text) !== norm(item.arabic_full);
  return { item, diff, ttsLettersDiffer };
}

function cost(r: ExplainPageResult) {
  return (r.usage.input_tokens * PRICE.input + r.usage.output_tokens * PRICE.output) / 1_000_000;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function arabicHtml(a: ItemAnalysis): string {
  const { item, diff } = a;
  if (diff.status === "ok" && diff.addedCount > 0) {
    // Two stacked layers: full text in a light colour underneath, printed-only
    // marks in full colour on top. Marks don't change letter widths, so only
    // the AI-added marks show through as light.
    return `<div class="ar stack" lang="ar" dir="rtl"><span class="ar-full" aria-hidden="true">${esc(item.arabic_full)}</span><span class="ar-printed">${esc(printedOnly(diff, item.arabic_full))}</span></div>`;
  }
  return `<div class="ar" lang="ar" dir="rtl">${esc(item.arabic_full)}</div>`;
}

function flagsHtml(a: ItemAnalysis): string {
  const { item, diff } = a;
  const flags: string[] = [];
  if (item.needs_checking) {
    flags.push(`<span class="flag warn">Needs checking${item.needs_checking_reason ? `: ${esc(item.needs_checking_reason)}` : ""}</span>`);
  }
  const isBlank = /\.{2,}|…/.test(item.arabic_printed);
  if (diff.status === "letters_differ" && isBlank) {
    flags.push(
      `<span class="flag info">Blank on the page: <span lang="ar" dir="rtl">${esc(item.arabic_printed)}</span></span>`,
    );
  } else if (diff.status === "letters_differ") {
    flags.push(
      `<span class="flag bad">Letters changed: printed <span lang="ar" dir="rtl">${esc(item.arabic_printed)}</span></span>`,
    );
  } else {
    if (diff.droppedCount > 0) {
      const dropped = diff.clusters.flatMap((c) => c.dropped.map((m) => MARK_NAMES[m] ?? "mark"));
      flags.push(`<span class="flag bad">Printed marks lost: ${esc(dropped.join(", "))}</span>`);
    }
    if (diff.addedCount > 0) flags.push(`<span class="flag info">AI added ${diff.addedCount} mark${diff.addedCount > 1 ? "s" : ""}</span>`);
  }
  if (a.ttsLettersDiffer) flags.push(`<span class="flag warn">Audio text has different letters</span>`);
  return flags.length ? `<div class="flags">${flags.join("")}</div>` : "";
}

function cardHtml(a: ItemAnalysis): string {
  const { item } = a;
  const audioDiffers = item.tts_text.trim() !== item.arabic_full.trim();
  return `<article class="card${item.needs_checking || (a.diff.status === "letters_differ" && !/\.{2,}|…/.test(item.arabic_printed)) ? " flagged" : ""}">
  <div class="meta"><span>#${item.order}</span><span>${esc(item.kind)}</span></div>
  ${arabicHtml(a)}
  ${audioDiffers ? `<div class="tts">voice says <span lang="ar" dir="rtl">${esc(item.tts_text)}</span></div>` : ""}
  <div class="pron">${esc(item.pronunciation)}</div>
  <div class="en">${esc(item.english)}</div>
  ${item.sound_note ? `<div class="note">${esc(item.sound_note)}</div>` : ""}
  ${flagsHtml(a)}
</article>`;
}

function pageHtml(r: PageRecord, run: string): string {
  const img = r.image ? `<a href="${esc(r.image)}" target="_blank"><img src="${esc(r.image)}" alt="Photo of ${esc(r.name)}"></a>` : "";
  if (!r.ok) {
    return `<section class="page"><h2>${esc(r.name)}</h2><p class="error">${esc(r.error)}</p>${img}</section>`;
  }
  const x = r.result.extraction;
  const analysed = x.items.map(analyse);
  const rows = new Map<number, ItemAnalysis[]>();
  for (const a of analysed) rows.set(a.item.row, [...(rows.get(a.item.row) ?? []), a]);
  const rowsHtml = [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, items]) => `<div class="row">${items.sort((a, b) => a.item.column - b.item.column).map(cardHtml).join("")}</div>`)
    .join("");

  const flagged = x.items.filter((i) => i.needs_checking).length;
  const added = analysed.reduce((n, a) => n + (a.diff.status === "ok" ? a.diff.addedCount : 0), 0);
  const problems = analysed.filter((a) => a.diff.status === "letters_differ" || (a.diff.status === "ok" && a.diff.droppedCount > 0)).length;
  const key = `${run}/${r.name}`;
  const checklist = GATE_1.map(
    (label, i) => `<label><input type="checkbox" data-key="${esc(key)}" data-i="${i}"> ${esc(label)}</label>`,
  ).join("");

  return `<section class="page" id="${esc(r.name)}">
  <header>
    <h2>${esc(r.name)}</h2>
    <p class="summary">${esc(x.page_summary)}</p>
    <dl class="stats">
      <div><dt>Page type</dt><dd>${esc(x.page_kind)}</dd></div>
      <div><dt>Items</dt><dd>${x.items.length}</dd></div>
      <div><dt>Need checking</dt><dd>${flagged}</dd></div>
      <div><dt>AI-added marks</dt><dd>${added}</dd></div>
      <div><dt>Mark/letter problems</dt><dd class="${problems ? "bad-text" : ""}">${problems}</dd></div>
      <div><dt>Photo quality</dt><dd>${esc(x.image_quality)}</dd></div>
      <div><dt>Time</dt><dd>${(r.result.latencyMs / 1000).toFixed(1)}s</dd></div>
      <div><dt>Cost</dt><dd>$${cost(r.result).toFixed(3)}</dd></div>
    </dl>
    ${x.image_quality_note ? `<p class="small">Photo: ${esc(x.image_quality_note)}</p>` : ""}
    ${x.skipped ? `<p class="small">Left out: ${esc(x.skipped)}</p>` : ""}
  </header>
  <div class="split">
    <div class="photo">${img}</div>
    <div class="cards">${rowsHtml}</div>
  </div>
  <fieldset class="gate">
    <legend>Gate 1 check for this page</legend>
    ${checklist}
    <textarea data-key="${esc(key)}" placeholder="Notes: what was wrong or missing?"></textarea>
  </fieldset>
</section>`;
}

export function buildReport(records: PageRecord[], run: string): string {
  const ok = records.filter((r): r is Extract<PageRecord, { ok: true }> => r.ok);
  const totalCost = ok.reduce((n, r) => n + cost(r.result), 0);
  const latencies = ok.map((r) => r.result.latencyMs / 1000).sort((a, b) => a - b);
  const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0;
  const first = ok[0]?.result;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page Reading Spike</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #f7f5f0; --surface: #ffffff; --text: #1d1b16; --muted: #6b665c; --border: #e2ddd2;
  --added: #c9a45c; --warn-bg: #fff3d6; --warn: #7a5200; --bad-bg: #fde4e1; --bad: #9b1c11;
  --info-bg: #efe9dc; --info: #5c4a22; --accent: #2f5d50;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #15140f; --surface: #1f1d17; --text: #efeadf; --muted: #a39d90; --border: #37332a;
    --added: #9c7d3f; --warn-bg: #3a2e12; --warn: #f2cf85; --bad-bg: #3d1a16; --bad: #f4a79e;
    --info-bg: #2c2719; --info: #d9c89f; --accent: #8cc7b5;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1400px; margin: 0 auto; padding: 24px 16px 80px; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 18px; margin: 0; }
.small, .muted { color: var(--muted); font-size: 13px; }
.intro { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin: 16px 0 24px; }
.intro .ar { font-size: 32px; }
.legend { display: flex; gap: 24px; flex-wrap: wrap; align-items: center; }
.stats { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 10px 0; }
.stats div { min-width: 90px; }
.stats dt { font-size: 12px; color: var(--muted); }
.stats dd { margin: 0; font-weight: 600; }
.bad-text { color: var(--bad); }
.page { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 28px; }
.page header { margin-bottom: 12px; }
.summary { margin: 4px 0; }
.split { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 16px; align-items: start; }
@media (max-width: 800px) { .split { grid-template-columns: 1fr; } }
.photo { position: sticky; top: 12px; }
.photo img { width: 100%; border-radius: 8px; border: 1px solid var(--border); display: block; }
.row { display: flex; flex-wrap: wrap; flex-direction: row-reverse; gap: 8px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed var(--border); }
.card { flex: 1 1 170px; max-width: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; background: var(--bg); }
.card.flagged { border-color: var(--warn); }
.meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.ar { font-family: "Noto Naskh Arabic", "Traditional Arabic", serif; font-size: 34px; line-height: 1.9; text-align: right; }
.stack { position: relative; }
.stack .ar-full { color: var(--added); }
.stack .ar-printed { position: absolute; inset: 0; color: var(--text); }
.tts { font-size: 13px; color: var(--muted); text-align: right; }
.tts span { font-family: "Noto Naskh Arabic", serif; font-size: 18px; }
.pron { font-weight: 700; font-size: 16px; color: var(--accent); }
.en { margin-top: 2px; }
.note { font-size: 13px; color: var(--muted); font-style: italic; margin-top: 4px; }
.flags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.flag { font-size: 12px; padding: 2px 8px; border-radius: 999px; }
.flag span { font-family: "Noto Naskh Arabic", serif; }
.warn { background: var(--warn-bg); color: var(--warn); }
.bad { background: var(--bad-bg); color: var(--bad); }
.info { background: var(--info-bg); color: var(--info); }
.error { color: var(--bad); font-weight: 600; }
.gate { margin-top: 16px; border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
.gate label { display: block; margin: 4px 0; }
.gate textarea { width: 100%; min-height: 60px; margin-top: 8px; font: inherit; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: var(--surface); cursor: pointer; }
</style>
</head>
<body>
<main>
  <h1>Page Reading Spike</h1>
  <p class="muted">Run ${esc(run)} · ${records.length} page(s)${first ? ` · ${esc(first.model)} · effort ${esc(first.effort)} · prompt ${esc(first.promptVersion)}` : ""}</p>
  <div class="intro">
    <dl class="stats">
      <div><dt>Pages read</dt><dd>${ok.length} / ${records.length}</dd></div>
      <div><dt>Median time per page</dt><dd>${median.toFixed(1)}s</dd></div>
      <div><dt>Total cost</dt><dd>$${totalCost.toFixed(3)}</dd></div>
    </dl>
    <div class="legend">
      <div class="ar stack" lang="ar" dir="rtl"><span class="ar-full" aria-hidden="true">كِتَابٌ</span><span class="ar-printed">كِتاب</span></div>
      <p class="small">Dark marks were printed in the book. Light marks were added by the AI.<br>Tick each Gate 1 item you have checked against the photo. Ticks and notes are saved in this browser.</p>
      <button type="button" id="export">Copy results</button>
    </div>
  </div>
  ${records.map((r) => pageHtml(r, run)).join("\n")}
</main>
<script>
(() => {
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  for (const box of document.querySelectorAll(".gate input")) {
    const k = "gate:" + box.dataset.key + ":" + box.dataset.i;
    box.checked = store.get(k) === "1";
    box.addEventListener("change", () => store.set(k, box.checked ? "1" : "0"));
  }
  for (const area of document.querySelectorAll(".gate textarea")) {
    const k = "notes:" + area.dataset.key;
    area.value = store.get(k) ?? "";
    area.addEventListener("input", () => store.set(k, area.value));
  }
  document.getElementById("export").addEventListener("click", async (e) => {
    const out = [...document.querySelectorAll(".gate")].map((g) => ({
      page: g.closest(".page").id,
      passed: [...g.querySelectorAll("input")].map((b) => ({ check: b.parentElement.textContent.trim(), ok: b.checked })),
      notes: g.querySelector("textarea").value,
    }));
    const text = JSON.stringify(out, null, 2);
    try { await navigator.clipboard.writeText(text); e.target.textContent = "Copied"; }
    catch { prompt("Copy these results:", text); }
  });
})();
</script>
</body>
</html>`;
}
