// Phase 0 Book Map spike: title page + contents pages in, lesson list out.
//
//   npm run spike:contents -- title.jpg contents-1.jpg contents-2.jpg contents-3.jpg
//
// Give the photos in page order.
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readContents, type BookMap } from "../../shared/read-contents.ts";
import { prepareImage } from "./image.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Give the title page and contents page photos in page order.");
  process.exit(1);
}

const client = new Anthropic();
const runDir = path.join(HERE, "out", `contents-${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_")}`);
await fs.mkdir(runDir, { recursive: true });

console.log(`Turning ${files.length} photo(s) upright…`);
const prepared = await Promise.all(files.map((f) => prepareImage(client, f)));
const images = prepared.map((p, i) => ({ file: `photo-${i + 1}.jpg`, ...p }));
await Promise.all(images.map((p) => fs.writeFile(path.join(runDir, p.file), p.buffer)));

console.log("Reading contents…");
const result = await readContents(client, prepared.map((p) => p.buffer));
await fs.writeFile(path.join(runDir, "book-map.json"), JSON.stringify({ sources: files, ...result }, null, 2));

const lessons = result.map.units.flatMap((u) => u.lessons);
const cost = (result.usage.input_tokens * 5 + result.usage.output_tokens * 25) / 1e6;
console.log(
  `${result.map.units.length} units, ${lessons.length} rows, ${lessons.filter((l) => l.needs_checking).length} need checking, ` +
    `${(result.latencyMs / 1000).toFixed(1)}s, $${cost.toFixed(3)}`,
);
await fs.writeFile(path.join(runDir, "report.html"), report(result.map, images.map((i) => i.file)));
console.log(`Report: ${path.join(runDir, "report.html")}`);

function report(map: BookMap, photos: string[]): string {
  const esc = (s: string | null | number) =>
    String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  let seq = 0;
  const rows = map.units
    .map((u) => {
      const head = u.title_ar
        ? `<tr class="unit"><th colspan="5"><span lang="ar" dir="rtl">${esc(u.title_ar)}</span> · ${esc(u.title_en)}${u.letters ? ` · <span lang="ar" dir="rtl">${esc(u.letters)}</span>` : ""}</th></tr>`
        : "";
      const body = u.lessons
        .map(
          (l) => `<tr class="${l.needs_checking ? "flag" : ""}">
  <td>${l.kind === "front_matter" ? "" : ++seq}</td>
  <td lang="ar" dir="rtl" class="ar">${esc(l.title_ar)}</td>
  <td>${esc(l.number_label)}: ${esc(l.title_en)}${l.needs_checking ? `<br><small>Needs checking: ${esc(l.needs_checking_reason)}</small>` : ""}</td>
  <td>${esc(l.kind)}${l.focus ? ` · <span lang="ar">${esc(l.focus)}</span>` : ""}</td>
  <td>${esc(l.page)}</td>
</tr>`,
        )
        .join("");
      return head + body;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Book Map Spike</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600&display=swap" rel="stylesheet">
<style>
:root { --bg: #f7f5f0; --surface: #fff; --text: #1d1b16; --muted: #6b665c; --border: #e2ddd2; --warn: #fff3d6; }
@media (prefers-color-scheme: dark) { :root { --bg: #15140f; --surface: #1f1d17; --text: #efeadf; --muted: #a39d90; --border: #37332a; --warn: #3a2e12; } }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 system-ui, "Segoe UI", sans-serif; }
main { max-width: 1400px; margin: 0 auto; padding: 24px 16px 60px; }
.split { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; align-items: start; }
@media (max-width: 900px) { .split { grid-template-columns: 1fr; } }
table { width: 100%; border-collapse: collapse; background: var(--surface); }
td, th { border-bottom: 1px solid var(--border); padding: 6px 8px; text-align: left; vertical-align: top; }
tr.unit th { background: var(--bg); padding-top: 14px; }
tr.flag { background: var(--warn); }
.ar, [lang="ar"] { font-family: "Noto Naskh Arabic", serif; font-size: 18px; }
td.ar { text-align: right; }
.photos img { width: 100%; margin-bottom: 8px; border-radius: 8px; border: 1px solid var(--border); }
.muted { color: var(--muted); }
</style></head><body><main>
<h1>Book Map Spike</h1>
<p><span lang="ar" dir="rtl">${esc(map.book_title_ar)}</span> · ${esc(map.book_title_en)}<br>
<span lang="ar" dir="rtl">${esc(map.level_ar)}</span> · ${esc(map.level_en)} · ${esc(map.publisher)} · ${esc(map.year)}</p>
${map.notes ? `<p class="muted">Notes: ${esc(map.notes)}</p>` : ""}
<div class="split"><table><thead><tr><th>#</th><th>Arabic</th><th>English</th><th>Kind</th><th>Page</th></tr></thead><tbody>${rows}</tbody></table>
<div class="photos">${photos.map((p) => `<a href="${p}" target="_blank"><img src="${p}" alt="${p}"></a>`).join("")}</div></div>
</main></body></html>`;
}
