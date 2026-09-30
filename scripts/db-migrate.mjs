// Applies local migrations in supabase/migrations/ that the project hasn't run
// yet, through the Supabase Management API (so a scoped access token is enough;
// no `supabase link`). Migrations are matched by file name.
//
//   npm run db:migrate            apply pending migrations
//   npm run db:migrate -- --dry   list pending migrations only
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "supabase", "migrations");
const { SUPABASE_PROJECT_REF: ref, SUPABASE_ACCESS_TOKEN: token } = process.env;
if (!ref || !token) {
  console.error("SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN must be set in .env");
  process.exit(1);
}
const dry = process.argv.includes("--dry");
const api = `https://api.supabase.com/v1/projects/${ref}/database/migrations`;
const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };

const res = await fetch(api, { headers });
if (!res.ok) throw new Error(`Listing migrations failed: ${res.status} ${await res.text()}`);
const applied = new Set((await res.json()).map((m) => m.name));

const pending = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => f.replace(/\.sql$/, ""))
  .filter((name) => !applied.has(name));

if (pending.length === 0) {
  console.log("Database is up to date.");
  process.exit(0);
}
for (const name of pending) {
  if (dry) {
    console.log(`pending: ${name}`);
    continue;
  }
  const query = fs.readFileSync(path.join(DIR, `${name}.sql`), "utf8");
  const r = await fetch(api, { method: "POST", headers, body: JSON.stringify({ name, query }) });
  if (!r.ok) {
    console.error(`✗ ${name}: ${r.status} ${await r.text()}`);
    process.exit(1);
  }
  console.log(`✓ ${name}`);
}
