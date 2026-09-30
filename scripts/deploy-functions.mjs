// Deploys every edge function (or the ones named) with the Supabase CLI,
// bundled on Supabase's side (--use-api), so Docker isn't needed.
//
//   npm run functions:deploy              all functions
//   npm run functions:deploy get-audio    one function
import { spawnSync } from "node:child_process";

const ref = process.env.SUPABASE_PROJECT_REF;
if (!ref || !process.env.SUPABASE_ACCESS_TOKEN) {
  console.error("SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN must be set in .env");
  process.exit(1);
}
const names = process.argv.slice(2);
const result = spawnSync(
  "npx",
  ["supabase", "functions", "deploy", ...names, "--project-ref", ref, "--use-api"],
  { stdio: "inherit", shell: true, env: process.env },
);
process.exit(result.status ?? 1);
