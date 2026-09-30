// Offline end to end on a production build (service worker active): download
// for offline, cut the connection, and check the study screens and audio still
// work. Also checks speaking practice lines get audio. Cleans up its test data.
//
//   npm run offline:check        (builds the app first: cd app && npx vite build)
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const PORT = 4175;
const APP = `http://localhost:${PORT}`;
const URL_ = process.env.SUPABASE_URL!;
const admin = createClient(URL_, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const map = JSON.parse(fs.readFileSync("spikes/page-reading/out/contents-20260930_001620/book-map.json", "utf8")).map;
const run = "spikes/page-reading/out/2026-09-30_032134";
const page8 = JSON.parse(fs.readFileSync(path.join(run, fs.readdirSync(run).find((f) => f.includes("2446") && f.endsWith(".json"))!), "utf8"));

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: "app", shell: true, stdio: "ignore" });
for (let i = 0; i < 40; i++) {
  if (await fetch(APP).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 500));
}

const email = `offline-${Date.now()}@rafiq.test`;
const password = crypto.randomUUID();
const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const userId = created.user!.id;
let bookId: string | undefined;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "rafiq-offline-"));
const ctx = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

try {
  // A class with page 8 and a practice conversation on one of its words.
  const classId = (await admin.rpc("create_class_from_book_map", { p_user: userId, p_class_name: "Offline class", p_map: map })).data as string;
  const cls = (await admin.from("classes").select("book_id, current_lesson_id").eq("id", classId).single()).data!;
  bookId = cls.book_id;
  const pageId = (await admin.rpc("save_scanned_page", {
    p_user: userId, p_book: cls.book_id, p_lesson: cls.current_lesson_id, p_model: "m", p_prompt_version: "v",
    p_page: { ...page8.result.extraction, page_number: 8 },
  })).data as string;
  const { data: placed } = await admin.from("page_cards").select("card_id").eq("page_id", pageId);
  const { data: words } = await admin.from("current_cards").select("id, kind").in("id", placed!.map((p) => p.card_id)).eq("kind", "word");
  const wordId = words![0].id;
  await admin.rpc("save_page_usages", {
    p_user: userId, p_page: pageId,
    p_items: [{ card_id: wordId, usage: { context: "At home", prompt_arabic: "مَا هٰذَا؟", prompt_pronunciation: "maa HAA-dhaa", prompt_english: "What is this?", response_arabic: "هٰذَا بَيْتٌ", response_pronunciation: "HAA-dhaa BAY-tun", response_english: "This is a house", tip: "هٰذَا + noun" } }],
  });

  const anon = createClient(URL_, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const usageKeys: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("/functions/v1/get-audio") && r.ok()) {
      const body = await r.json().catch(() => null);
      if (body) usageKeys.push(...Object.keys(body.audio).filter((k) => k.includes(":")));
    }
  });
  await page.goto(`${APP}/signin`);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${process.env.SUPABASE_PROJECT_REF}-auth-token`, JSON.stringify(s.session)]);
  await page.goto(`${APP}/class/${classId}`);
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 30000 });
  await page.reload(); // now controlled by the service worker

  // Speaking practice lines have audio.
  await page.goto(`${APP}/class/${classId}/page/${pageId}?practice=1`);
  await page.getByText("What is this?").waitFor({ timeout: 30000 });
  await page.waitForTimeout(4000);
  check("speaking practice: both lines are voiced", usageKeys.some((k) => k.endsWith(":prompt")) && usageKeys.some((k) => k.endsWith(":response")), usageKeys.join(", "));

  // Download for offline.
  await page.goto(`${APP}/class/${classId}`);
  await page.getByRole("button", { name: /Download for offline|Update offline copy/ }).click();
  const ready = await page.getByText(/Ready offline · \d+ audio clips/).waitFor({ timeout: 300000 }).then(() => true, () => false);
  const note = ready ? await page.getByText(/Ready offline/).textContent() : "";
  const clips = await page.evaluate(async () => (await (await caches.open("rafiq-audio")).keys()).length);
  check("download for offline finished", ready, `${note?.trim()}; ${clips} clips on the phone`);

  // Offline.
  await ctx.setOffline(true);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const visit = async (label: string, url: string, expect: RegExp | string) => {
    await page.goto(url);
    const ok = await page.getByText(expect).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
    const banner = await page.getByText("Offline.", { exact: false }).first().isVisible().catch(() => false);
    check(`offline: ${label}`, ok, banner ? "offline banner shown" : "no banner");
    return ok;
  };
  await visit("Home", `${APP}/learn`, "The alphabet");
  if (await visit("Letters", `${APP}/learn/letters`, "baaʾ")) {
    await page.getByRole("button", { name: /Letter baaʾ/ }).click();
    await page.getByText("Long sounds").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /Play ba$/ }).first().click();
    await page.waitForTimeout(800);
    const missing = await page.getByText("isn't saved on the phone").isVisible().catch(() => false);
    check("offline: letter sound plays from the phone", !missing);
  }
  await visit("Conversation", `${APP}/learn/talk/greetings`, "Good morning");
  await visit("Today", `${APP}/class/${classId}`, "Lesson One: (Baa)");
  await visit("saved page", `${APP}/class/${classId}/page/${pageId}`, "Book reference");
  await visit("speaking practice", `${APP}/class/${classId}/page/${pageId}?practice=1`, "What is this?");
  const practiceAudio = !(await page.getByText("isn't saved on the phone").isVisible().catch(() => false));
  check("offline: practice line audio from the phone", practiceAudio);
  await visit("Lessons", `${APP}/class/${classId}/lessons`, "Lesson Two: (Taa)");
  await visit("Practice", `${APP}/class/${classId}/practice`, "Hear & pick");
  await visit("My Words", `${APP}/class/${classId}/words`, "My Words");
  check("offline: no crashes", errors.length === 0, errors.join(" | "));
} finally {
  await ctx.close();
  server.kill();
  if (process.platform === "win32") spawn("powershell", ["-NoProfile", "-Command", `$p=(Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue).OwningProcess; if($p){Stop-Process -Id $p -Force}`], { stdio: "ignore" });
  if (bookId) {
    await admin.from("classes").delete().eq("book_id", bookId);
    await admin.from("books").delete().eq("id", bookId);
  }
  await admin.auth.admin.deleteUser(userId);
  console.log(failures ? `\n${failures} FAILED` : "\nAll offline checks passed");
  process.exitCode = failures ? 1 : 0;
}
