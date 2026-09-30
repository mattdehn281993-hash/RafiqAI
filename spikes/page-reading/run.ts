// Phase 0 page-reading spike.
//
//   npm run spike:pages                      read every photo in spikes/page-reading/pages/
//   npm run spike:pages -- a.jpg b.jpg       read specific photos
//   npm run spike:pages -- --effort xhigh    try a different effort level
//   npm run spike:pages -- --report-only out/2026-09-30_2140
//                                            rebuild the report from saved results (no API calls)
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { explainPage, EXPLAIN_PAGE_MODEL, ExplainPageError, type Effort } from "../../supabase/functions/_shared/explain-page.ts";
import { prepareImage } from "./image.ts";
import { buildReport, type PageRecord } from "./report.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.join(HERE, "pages");
const OUT_DIR = path.join(HERE, "out");
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    effort: { type: "string", default: "high" },
    model: { type: "string", default: EXPLAIN_PAGE_MODEL },
    concurrency: { type: "string", default: "3" },
    "report-only": { type: "string" },
    "no-rotate": { type: "boolean", default: false },
  },
});

async function main() {
  if (args["report-only"]) {
    const runDir = path.resolve(HERE, args["report-only"]);
    const records = await loadRecords(runDir);
    await writeReport(runDir, records);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    fail("ANTHROPIC_API_KEY is empty. Add it to the .env file in the project root, then run again.");
  }

  const files = await collectImages(positionals.length ? positionals : [PAGES_DIR]);
  if (files.length === 0) {
    fail(`No photos found. Put page photos (JPG/PNG) in:\n  ${PAGES_DIR}\nand run again.`);
  }

  const runDir = path.join(OUT_DIR, timestamp());
  await fs.mkdir(runDir, { recursive: true });
  const client = new Anthropic();
  const effort = args.effort as Effort;
  console.log(`Reading ${files.length} page(s) with ${args.model}, effort ${effort} → ${path.relative(process.cwd(), runDir)}\n`);

  const records: PageRecord[] = [];
  await pool(files, Number(args.concurrency), async (file) => {
    const record = await processPage(client, file, runDir, effort);
    records.push(record);
    await fs.writeFile(path.join(runDir, `${record.name}.json`), JSON.stringify(record, null, 2));
    console.log(summaryLine(record));
  });

  records.sort((a, b) => a.name.localeCompare(b.name));
  await writeReport(runDir, records);
}

async function processPage(client: Anthropic, file: string, runDir: string, effort: Effort): Promise<PageRecord> {
  const name = path.parse(file).name;
  const image = `${name}.jpg`;
  let prepared: Awaited<ReturnType<typeof prepareImage>>;
  try {
    prepared = await prepareImage(client, file, !args["no-rotate"]);
  } catch (err) {
    const heic = /\.hei[cf]$/i.test(file);
    const hint = heic ? " (iPhone HEIC photos: set Camera → Formats → Most Compatible, or export as JPEG)" : "";
    return { name, source: file, image: null, ok: false, error: `Could not read image${hint}: ${err}` };
  }
  await fs.writeFile(path.join(runDir, image), prepared.buffer);

  try {
    const result = await explainPage(
      client,
      { base64: prepared.buffer.toString("base64"), mediaType: "image/jpeg" },
      { effort, model: args.model },
    );
    return { name, source: file, image, width: prepared.width, height: prepared.height, rotation: prepared.rotation, ok: true, result };
  } catch (err) {
    return { name, source: file, image, ok: false, error: describeError(err) };
  }
}

function describeError(err: unknown): string {
  if (err instanceof ExplainPageError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "Invalid ANTHROPIC_API_KEY";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited; try again with --concurrency 1";
  if (err instanceof Anthropic.APIError) return `API error ${err.status}: ${err.message}`;
  return String(err);
}

function summaryLine(r: PageRecord): string {
  if (!r.ok) return `  ✗ ${r.name}: ${r.error}`;
  const { extraction: x, latencyMs, usage } = r.result;
  const flagged = x.items.filter((i) => i.needs_checking).length;
  return `  ✓ ${r.name}: ${x.items.length} items, ${flagged} need checking, ${(latencyMs / 1000).toFixed(1)}s, ${usage.input_tokens} in / ${usage.output_tokens} out tokens`;
}

async function writeReport(runDir: string, records: PageRecord[]) {
  const html = buildReport(records, path.basename(runDir));
  const file = path.join(runDir, "report.html");
  await fs.writeFile(file, html);
  console.log(`\nReport: ${file}`);
}

async function loadRecords(runDir: string): Promise<PageRecord[]> {
  const names = (await fs.readdir(runDir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(names.map(async (f) => JSON.parse(await fs.readFile(path.join(runDir, f), "utf8"))));
}

async function collectImages(inputs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const input of inputs) {
    const p = path.resolve(input);
    const stat = await fs.stat(p).catch(() => null);
    if (!stat) fail(`Not found: ${input}`);
    if (stat.isDirectory()) {
      for (const f of (await fs.readdir(p)).sort()) {
        if (IMAGE_EXT.has(path.extname(f).toLowerCase())) out.push(path.join(p, f));
      }
    } else {
      out.push(p);
    }
  }
  return out;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  });
  await Promise.all(workers);
}

function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

await main();
