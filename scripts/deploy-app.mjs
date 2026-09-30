// Builds the app here (with the public Supabase URL and publishable key baked in)
// and publishes the static files to Vercel, then points sign-in emails at the
// published address.
//
//   npm run app:deploy
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const env = process.env;
if (!env.VERCEL_TOKEN) {
  console.error("VERCEL_TOKEN is empty in .env (create one at https://vercel.com/account/tokens)");
  process.exit(1);
}
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { shell: true, encoding: "utf8", ...opts });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    process.exit(r.status ?? 1);
  }
  return r.stdout.trim();
};

run("npm", ["run", "build"], {
  cwd: "app",
  stdio: "inherit",
  env: { ...env, VITE_SUPABASE_URL: env.SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY },
});
fs.mkdirSync("app/dist/.vercel", { recursive: true });
if (fs.existsSync("app/.vercel/project.json")) fs.copyFileSync("app/.vercel/project.json", "app/dist/.vercel/project.json");

const out = run("npx", ["--yes", "vercel@latest", "deploy", "--prod", "--yes", "--name", "rafiq", "--token", env.VERCEL_TOKEN], { cwd: "app/dist" });
if (fs.existsSync("app/dist/.vercel/project.json")) {
  fs.mkdirSync("app/.vercel", { recursive: true });
  fs.copyFileSync("app/dist/.vercel/project.json", "app/.vercel/project.json");
}
const url = out.split(/\s+/).find((s) => s.startsWith("https://"));
console.log(`Deployed: ${url}`);

// Sign-in links and redirects must allow the published address. Use the stable
// production alias if Vercel reports one.
const alias = run("npx", ["--yes", "vercel@latest", "inspect", url, "--token", env.VERCEL_TOKEN], { cwd: "app/dist" })
  .split(/\s+/)
  .find((s) => /^https:\/\/rafiq[\w-]*\.vercel\.app$/.test(s));
run("node", ["--env-file=.env", "scripts/configure-auth.mjs", alias ?? url], { stdio: "inherit" });
console.log(`Open on your phone: ${alias ?? url}`);
