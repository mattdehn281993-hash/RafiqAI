// Password sign-in end to end, in a phone-sized browser: create an account (no
// email sent), stay signed in across reloads and a fresh app start, sign out and
// back in, change the password, and the friendly errors. Cleans up its users.
//
//   npm run auth:check                      against the dev server (:5173)
//   APP_URL=https://rafiq-ai-chi.vercel.app npm run auth:check
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const APP = process.env.APP_URL ?? "http://localhost:5173";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const email = `auth-${Date.now()}@rafiq.test`;
const pass1 = `Pw-${crypto.randomUUID().slice(0, 12)}`;
const pass2 = `Pw-${crypto.randomUUID().slice(0, 12)}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rafiq-auth-"));
let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

// A persistent profile behaves like the installed app: storage survives restarts.
const open = () => chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

let ctx = await open();
try {
  let page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`${APP}/signin`);
  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Choose a password/).fill(pass1);
  await page.locator("form").getByRole("button", { name: "Create account" }).click();
  await page.getByText("The alphabet", { exact: true }).waitFor({ timeout: 20000 }).catch(async () => {
    const shown = await page.locator(".bg-bad-bg").allInnerTexts();
    throw new Error(`not signed in after Create account; screen shows: ${shown.join(" | ") || "(no error)"}`);
  });
  check("create account with a password lands on Learn home, no email needed", new URL(page.url()).pathname === "/learn");

  await page.reload();
  await page.getByText("The alphabet", { exact: true }).waitFor({ timeout: 20000 });
  check("still signed in after reload", new URL(page.url()).pathname === "/learn");

  await ctx.close();
  ctx = await open();
  page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(APP);
  await page.getByText("The alphabet", { exact: true }).waitFor({ timeout: 20000 });
  check("still signed in after closing and reopening the app", new URL(page.url()).pathname === "/learn");

  await page.goto(`${APP}/account`);
  await page.getByText(email).waitFor({ timeout: 20000 });
  await page.getByLabel("New password").fill(pass2);
  await page.getByRole("button", { name: "Save password" }).click();
  await page.getByText("Password saved").waitFor({ timeout: 20000 });
  check("password changed under Account", true);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign in" }).first().waitFor({ timeout: 20000 });
  check("sign out returns to sign-in", new URL(page.url()).pathname === "/signin");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(pass1);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await page.getByText("don't match").waitFor({ timeout: 20000 });
  check("old password is refused with a clear message", true);

  await page.getByLabel("Password").fill(pass2);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await page.getByText("The alphabet", { exact: true }).waitFor({ timeout: 20000 }).catch(async () => {
    const shown = await page.locator(".bg-bad-bg").allInnerTexts();
    const direct = await createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } })
      .auth.signInWithPassword({ email, password: pass2 });
    throw new Error(`new password sign-in failed; screen: ${shown.join(" | ") || "(no error)"}; direct API: ${direct.error?.message ?? "works"}`);
  });
  check("sign in with the new password", new URL(page.url()).pathname === "/learn");

  // Creating an account for an email that already has one explains what to do.
  await page.goto(`${APP}/account`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Choose a password/).fill(pass1);
  await page.locator("form").getByRole("button", { name: "Create account" }).click();
  const outcome = await Promise.race([
    page.getByText("already has an account").waitFor({ timeout: 20000 }).then(() => "message"),
    page.getByText("The alphabet", { exact: true }).waitFor({ timeout: 20000 }).then(() => "signed-in"),
  ]).catch(() => "nothing");
  check("existing email on Create account is handled", outcome === "message", outcome);

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  check("sign-in screen fits the phone width", width <= 390, `${width}px`);
  await page.screenshot({ path: path.join(profile, "signin.png") });
} catch (err) {
  failures++;
  console.log(`✗ ${err instanceof Error ? err.message.split("\n")[0] : err}`);
} finally {
  await ctx.close();
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const u of data?.users ?? []) if (u.email === email) await admin.auth.admin.deleteUser(u.id);
  console.log(failures ? `\n${failures} FAILED` : "\nAll sign-in checks passed");
  process.exitCode = failures ? 1 : 0;
}
