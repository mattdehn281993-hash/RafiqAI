// Screenshots every app screen at phone size with a throwaway user whose class
// uses the real Book Map and page 8 from the Phase 0 runs. Cleans up afterwards.
//
//   (dev server running on :5173)  npm run ui:screens -- <output dir>
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const out = path.resolve(process.argv[2] ?? "ui-screens");
fs.mkdirSync(out, { recursive: true });
const URL = process.env.SUPABASE_URL!;
const ref = process.env.SUPABASE_PROJECT_REF!;
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const APP = "http://localhost:5173";

const map = JSON.parse(fs.readFileSync("spikes/page-reading/out/contents-20260930_001620/book-map.json", "utf8")).map;
const run = "spikes/page-reading/out/2026-09-30_032134";
const page8 = JSON.parse(fs.readFileSync(path.join(run, fs.readdirSync(run).find((f) => f.includes("2446") && f.endsWith(".json"))!), "utf8"));

const email = `ui-${Date.now()}@rafiq.test`;
const password = crypto.randomUUID();
const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
const userId = created.user.id;
let bookId: string | undefined;

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const classId = (await admin.rpc("create_class_from_book_map", { p_user: userId, p_class_name: "Evening Fusha class", p_map: map })).data as string;
  const cls = (await admin.from("classes").select("book_id, current_lesson_id").eq("id", classId).single()).data!;
  bookId = cls.book_id;
  const pageId = (await admin.rpc("save_scanned_page", {
    p_user: userId, p_book: cls.book_id, p_lesson: cls.current_lesson_id, p_model: page8.result.model,
    p_prompt_version: page8.result.promptVersion, p_page: { ...page8.result.extraction, page_number: 8 },
  })).data as string;
  const cardIds = ((await admin.from("page_cards").select("card_id").eq("page_id", pageId)).data ?? []).map((r) => r.card_id);
  await admin.from("saved_words").insert(cardIds.slice(4, 7).map((card_id) => ({ user_id: userId, card_id, lesson_id: cls.current_lesson_id })));

  const anon = createClient(URL, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: signIn } = await anon.auth.signInWithPassword({ email, password });

  for (const scheme of ["light", "dark"] as const) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: scheme,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    if (scheme === "light") {
      await page.goto(`${APP}/signin`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, "01-signin.png") });
    }
    await page.goto(APP);
    await page.evaluate(([key, session]) => localStorage.setItem(key, session), [`sb-${ref}-auth-token`, JSON.stringify(signIn.session)]);

    const shots: [string, string, boolean?][] = [
      ["02-today", `/class/${classId}`],
      ["03-page", `/class/${classId}/page/${pageId}`, true],
      ["04-lessons", `/class/${classId}/lessons`],
      ["05-words", `/class/${classId}/words`],
      ["06-snap", `/class/${classId}/snap`],
      ["07-setup", `/setup`],
      ["08-invite", `/class/${classId}/invite`],
    ];
    for (const [name, route, full] of shots) {
      if (scheme === "dark" && !["02-today", "03-page"].includes(name)) continue;
      await page.goto(APP + route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1200);
      // Horizontal overflow is the classic phone-layout bug: check every screen.
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      if (width > 390) errors.push(`${name} is ${width}px wide (wider than the phone)`);
      await page.screenshot({ path: path.join(out, `${name}-${scheme}.png`), fullPage: !!full });
    }
    // Editor correction flow, through the UI: report → Fix card → save → page shows the new text.
    if (scheme === "light") {
      const target = cardIds[1];
      await admin.from("reports").insert({ card_id: target, card_version: 1, reporter: userId, message: "The teacher says this means “look carefully and notice”." });
      await page.goto(`${APP}/class/${classId}/reports`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(out, "09-reports-light.png") });
      await page.getByRole("button", { name: "Fix card" }).first().click();
      const english = page.getByLabel("English meaning");
      await english.fill("Look carefully and notice");
      await page.getByLabel("Why (e.g. “teacher's meaning”)").fill("teacher's meaning");
      await page.screenshot({ path: path.join(out, "10-correct-sheet-light.png") });
      await page.getByRole("button", { name: "Save correction" }).click();
      await page.getByText("No open reports").waitFor({ timeout: 20000 });
      const { data: fixed } = await admin.from("current_cards").select("english, current_version").eq("id", target).single();
      const { data: rep } = await admin.from("reports").select("status").eq("card_id", target).single();
      const ok = fixed?.english === "Look carefully and notice" && fixed?.current_version === 2 && rep?.status === "accepted";
      console.log(`${ok ? "✓" : "✗"} correction through the app: v${fixed?.current_version}, "${fixed?.english}", report ${rep?.status}`);
      if (!ok) errors.push("correction flow failed");
      await page.goto(`${APP}/class/${classId}/page/${pageId}`);
      await page.getByText("Look carefully and notice").first().waitFor({ timeout: 15000 });
      console.log("✓ page shows the corrected card");
    }

    // Letters tab: all 28 letters, tap one to open its name and sounds.
    if (scheme === "light") {
      await page.goto(`${APP}/class/${classId}/letters`);
      await page.getByRole("button", { name: /Letter taaʾ/ }).waitFor({ timeout: 30000 });
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      if (width > 390) errors.push(`letters is ${width}px wide`);
      await page.screenshot({ path: path.join(out, "17-letters-light.png") });
      await page.getByRole("button", { name: /Letter taaʾ/ }).click();
      await page.getByText("Long sounds").waitFor({ timeout: 30000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(out, "18-letter-sheet-light.png") });
      const sounds = await page.locator('[role="dialog"] button[aria-label^="Play "]').count();
      console.log(`${sounds === 7 ? "✓" : "✗"} letter sheet shows name + 6 sounds (${sounds})`);
      if (sounds !== 7) errors.push("letter sheet incomplete");
      await page.getByRole("button", { name: "Close" }).click();
    }

    // Tonight's Preview → 2-minute quiz → score saved; Practice → progress saved; check-in.
    if (scheme === "light") {
      const answerAll = async (doneText: string) => {
        for (let i = 0; i < 40; i++) {
          if (await page.getByText(doneText).first().isVisible().catch(() => false)) return true;
          const option = page.locator("div.grid.grid-cols-2 > button").first();
          if (await option.isVisible().catch(() => false)) await option.click().catch(() => {});
          await page.waitForTimeout(1800);
        }
        return false;
      };

      await page.goto(`${APP}/class/${classId}/preview`);
      await page.getByText("Tap to hear it").waitFor({ timeout: 30000 });
      await page.screenshot({ path: path.join(out, "11-preview-card-light.png") });
      for (let i = 0; i < 20; i++) {
        const start = page.getByRole("button", { name: "Start the 2-minute quiz" });
        if (await start.isVisible().catch(() => false)) {
          await start.click();
          break;
        }
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, "12-preview-quiz-light.png") });
      const previewDone = await answerAll("Preview done");
      await page.screenshot({ path: path.join(out, "13-preview-done-light.png") });
      await page.waitForTimeout(1500);
      const { data: runs } = await admin.from("preview_runs").select("score, total").eq("user_id", userId);
      const okPreview = previewDone && (runs?.length ?? 0) === 1 && (runs![0].total ?? 0) > 0;
      console.log(`${okPreview ? "✓" : "✗"} Tonight's Preview → quiz → saved (${runs?.[0]?.score}/${runs?.[0]?.total})`);
      if (!okPreview) errors.push("preview flow failed");

      await page.goto(`${APP}/class/${classId}/practice`);
      await page.getByText("Hear & pick").waitFor({ timeout: 30000 });
      await page.screenshot({ path: path.join(out, "14-practice-light.png") });
      await page.getByText("Hear & pick").click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, "15-hear-pick-light.png") });
      const practiceDone = await answerAll("Back to Practice");
      await page.waitForTimeout(1500);
      const { count } = await admin.from("progress").select("card_id", { count: "exact", head: true }).eq("user_id", userId);
      const okPractice = practiceDone && (count ?? 0) > 0;
      console.log(`${okPractice ? "✓" : "✗"} Practice hear & pick → progress saved (${count} cards)`);
      if (!okPractice) errors.push("practice flow failed");

      await page.goto(`${APP}/class/${classId}`);
      await page.getByRole("button", { name: "Partly" }).click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, "16-today-after-light.png"), fullPage: true });
      const { data: check } = await admin.from("checkins").select("answer").eq("user_id", userId);
      const okCheck = check?.[0]?.answer === "partly";
      console.log(`${okCheck ? "✓" : "✗"} after-class check-in saved (${check?.[0]?.answer})`);
      if (!okCheck) errors.push("check-in failed");
    }

    console.log(`${scheme}: ${errors.length ? errors.join(" | ") : "every screen fits the phone width, no console errors"}`);
    await context.close();
  }
} finally {
  await browser.close();
  if (bookId) {
    await admin.from("classes").delete().eq("book_id", bookId);
    await admin.from("books").delete().eq("id", bookId);
  }
  await admin.auth.admin.deleteUser(userId);
  console.log(`screens in ${out}; test user removed`);
}
