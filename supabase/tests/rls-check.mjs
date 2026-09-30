import { PGlite } from "@electric-sql/pglite";
// Applies every migration to an in-memory Postgres (PGlite) with stand-ins for
// Supabase's auth and storage schemas, then checks the row-level security rules
// as an editor, a student joining by invite, an outsider and an anonymous visitor.
//
//   npm run test:db
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migrations = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const db = new PGlite();

// Minimal stand-ins for what Supabase provides.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, storage to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);

for (const m of migrations) {
  await db.exec(fs.readFileSync(path.join(dir, m), "utf8"));
  console.log(`✓ applied ${m}`);
}

const A = "00000000-0000-0000-0000-00000000000a"; // editor
const B = "00000000-0000-0000-0000-00000000000b"; // student joining by invite
const C = "00000000-0000-0000-0000-00000000000c"; // outsider
await db.exec(`insert into auth.users values ('${A}'), ('${B}'), ('${C}')`);

// Seed as the service role would (superuser here).
const ids = (await db.query(`
  with b as (insert into books (title_ar, created_by) values ('كتاب', '${A}') returning id),
  u as (insert into units (book_id, position, title_ar) select id, 1, 'الوحدة الأولى' from b returning id, book_id),
  l as (insert into lessons (book_id, unit_id, position, title_ar, kind, focus) select book_id, id, 1, 'الباء', 'letter', 'ب' from u returning id, book_id),
  c as (insert into classes (book_id, name, created_by) select id, 'Class', '${A}' from b returning id)
  select (select id from b) book, (select id from l) lesson, (select id from c) class`)).rows[0];
await db.exec(`
  insert into memberships (class_id, user_id, role) values ('${ids.class}', '${A}', 'editor');
  insert into invites (code, class_id, created_by) values ('abc12345', '${ids.class}', '${A}');
  insert into cards (id, book_id, kind) values ('00000000-0000-0000-0000-0000000000c1', '${ids.book}', 'word');
  insert into card_versions (card_id, version, arabic_printed, arabic_full, tts_text, pronunciation, english)
    values ('00000000-0000-0000-0000-0000000000c1', 1, 'كتاب', 'كِتَاب', 'كِتَابْ', 'ki-TAAB', 'book');
  insert into pages (id, book_id, lesson_id, page_number) values ('00000000-0000-0000-0000-0000000000f1', '${ids.book}', '${ids.lesson}', 8);
  insert into page_cards (page_id, position, card_id) values ('00000000-0000-0000-0000-0000000000f1', 1, '00000000-0000-0000-0000-0000000000c1');
  insert into cards (id, level, kind) values ('00000000-0000-0000-0000-0000000000c2', 1, 'syllable');
  insert into card_versions (card_id, version, arabic_printed, arabic_full, tts_text, pronunciation, english)
    values ('00000000-0000-0000-0000-0000000000c2', 1, 'بَ', 'بَ', 'بَ', 'ba', 'b with fatha');
`);

let failures = 0;
async function as(user, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
async function expect(label, fn, check) {
  try {
    const r = await fn();
    const ok = check(r, null);
    console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : "  → got " + JSON.stringify(r.rows ?? r)}`);
    if (!ok) failures++;
  } catch (e) {
    const ok = check(null, e);
    console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : "  → error " + e.message}`);
    if (!ok) failures++;
  }
}
const rows = (n) => (r) => r && r.rows.length === n;
const denied = (r, e) => !!e;
const count = (n) => (r) => r && Number(r.rows[0].n) === n;

// Outsider sees nothing shared except built-in cards.
await expect("outsider cannot see the book", () => as(C, "select * from books"), rows(0));
await expect("outsider cannot see lessons", () => as(C, "select * from lessons"), rows(0));
await expect("outsider cannot see book cards (only built-in)", () => as(C, "select * from current_cards"), rows(1));

// Student joins with the invite code.
await expect("student before joining sees no classes", () => as(B, "select * from classes"), rows(0));
await expect("wrong invite code is rejected", () => as(B, "select redeem_invite('nope')"), denied);
await expect("student redeems invite", () => as(B, "select redeem_invite('ABC12345') as id"), (r) => r && r.rows[0].id === ids.class);
await expect("redeeming twice is harmless", () => as(B, "select redeem_invite('abc12345') as id"), (r) => r && r.rows[0].id === ids.class);
await expect("invite use counted once", () => db.query("select uses as n from invites"), count(1));
await expect("student is a student, not an editor", () => as(B, `select role from memberships where user_id = '${B}'`), (r) => r && r.rows[0]?.role === "student");

// Student reads shared content.
await expect("student sees the book", () => as(B, "select * from books"), rows(1));
await expect("student sees lessons", () => as(B, "select * from lessons"), rows(1));
await expect("student sees page + page cards", () => as(B, "select * from page_cards"), rows(1));
await expect("student sees book and built-in cards", () => as(B, "select * from current_cards"), rows(2));

// Student cannot change shared content.
await expect("student cannot insert cards", () => as(B, `insert into cards (book_id, kind) values ('${ids.book}', 'word')`), denied);
await expect("student cannot edit card versions", () => as(B, "update card_versions set english = 'x' returning 1"), (r, e) => !!e || r.rows.length === 0);
await expect("student cannot move class position", () => as(B, `update classes set current_lesson_id = '${ids.lesson}' returning 1`), (r, e) => !!e || r.rows.length === 0);
await expect("student cannot create invites", () => as(B, `insert into invites (class_id) values ('${ids.class}')`), denied);
await expect("student cannot see invites", () => as(B, "select * from invites"), rows(0));
await expect("student cannot make themselves editor", () => as(B, `update memberships set role = 'editor' where user_id = '${B}' returning 1`), (r, e) => !!e || r.rows.length === 0);

// Editor.
await expect("editor moves class position", () => as(A, `update classes set current_lesson_id = '${ids.lesson}' returning 1`), rows(1));
await expect("editor cannot rename class (column not granted)", () => as(A, "update classes set name = 'x' returning 1"), denied);
await expect("editor sees all class memberships", () => as(A, "select * from memberships"), rows(2));
await expect("editor creates invite", () => as(A, `insert into invites (class_id) values ('${ids.class}') returning code`), rows(1));

// Personal data stays private.
await expect("student saves progress", () => as(B, "insert into progress (card_id, times_practised) values ('00000000-0000-0000-0000-0000000000c1', 1) returning 1"), rows(1));
await expect("student saves a word", () => as(B, `insert into saved_words (card_id, lesson_id) values ('00000000-0000-0000-0000-0000000000c1', '${ids.lesson}') returning 1`), rows(1));
await expect("student checks in", () => as(B, `insert into checkins (lesson_id, answer) values ('${ids.lesson}', 'partly') returning 1`), rows(1));
await expect("editor cannot see student's progress", () => as(A, "select * from progress"), rows(0));
await expect("editor cannot see student's saved words", () => as(A, "select * from saved_words"), rows(0));
await expect("student cannot write progress for someone else", () => as(B, `insert into progress (user_id, card_id) values ('${A}', '00000000-0000-0000-0000-0000000000c2')`), denied);
await expect("outsider cannot save a card they can't see", () => as(C, "insert into saved_words (card_id) values ('00000000-0000-0000-0000-0000000000c1')"), denied);

// Reports.
await expect("student reports a mistake", () => as(B, "insert into reports (card_id, card_version, message) values ('00000000-0000-0000-0000-0000000000c1', 1, 'wrong meaning') returning 1"), rows(1));
await expect("editor sees the report", () => as(A, "select * from reports"), rows(1));
await expect("outsider cannot report a card they can't see", () => as(C, "insert into reports (card_id, card_version, message) values ('00000000-0000-0000-0000-0000000000c1', 1, 'x')"), denied);
await expect("outsider sees no reports", () => as(C, "select * from reports"), rows(0));

// Save functions: service role only.
const map = JSON.stringify({
  book_title_ar: "سلسلة", level_ar: "التمهيدي",
  units: [
    { title_ar: null, lessons: [{ number_label: "", title_ar: "المقدمة", kind: "front_matter", page: 2 }] },
    { title_ar: "الوحدة الأولى", letters: "ب - ت", lessons: [
      { number_label: "Lesson 1", title_ar: "الباء", kind: "letter", focus: "ب", page: 8 },
      { number_label: "Lesson 2", title_ar: "التاء", kind: "letter", focus: "ت", page: 14 },
    ] },
  ],
}).replace(/'/g, "''");
await expect("app cannot call create_class_from_book_map", () => as(C, `select create_class_from_book_map('${C}', 'x', '${map}'::jsonb)`), denied);
await expect("app cannot call save_scanned_page", () => as(B, `select save_scanned_page('${B}', '${ids.book}', null, 'm', 'v', '{}'::jsonb)`), denied);

const newClass = (await db.query(`select create_class_from_book_map('${C}', 'Evening class', '${map}'::jsonb) as id`)).rows[0].id;
await expect("Book Map creates 3 lessons in order", () => as(C, "select title_ar from lessons order by position"), (r) => r && r.rows.map((x) => x.title_ar).join(",") === "المقدمة,الباء,التاء");
await expect("creator becomes editor of the new class", () => as(C, `select role from memberships where class_id = '${newClass}'`), (r) => r && r.rows[0]?.role === "editor");
await expect("class starts at the first real lesson", () => as(C, "select l.title_ar from classes c join lessons l on l.id = c.current_lesson_id"), (r) => r && r.rows[0]?.title_ar === "الباء");
await expect("other classes' members can't see the new book", () => as(B, "select * from books"), rows(1));

const page = JSON.stringify({
  page_number: 9, page_kind: "letter_grid", page_summary: "s", image_quality: "good",
  items: [
    { order: 2, row: 1, column: 2, kind: "word", arabic_printed: "بنت", arabic_full: "بِنْت", tts_text: "بِنْتْ", pronunciation: "bint", english: "girl", sound_note: null, needs_checking: false, needs_checking_reason: null },
    { order: 1, row: 1, column: 1, kind: "syllable", arabic_printed: "بِ", arabic_full: "بِ", tts_text: "بِ", pronunciation: "bi", english: "b with kasra", sound_note: null, needs_checking: true, needs_checking_reason: "faint" },
  ],
}).replace(/'/g, "''");
const pageId = (await db.query(`select save_scanned_page('${A}', '${ids.book}', '${ids.lesson}', 'claude-opus-5', 'v3', '${page}'::jsonb) as id`)).rows[0].id;
await expect("saved page cards are in reading order", () => as(B, `select c.english from page_cards pc join current_cards c on c.id = pc.card_id where pc.page_id = '${pageId}' order by pc.position`), (r) => r && r.rows.map((x) => x.english).join(",") === "b with kasra,girl");
await expect("needs-checking flag is kept", () => as(B, `select count(*)::int n from current_cards where needs_checking`), count(1));
await expect("same page number can't be saved twice", () => db.query(`select save_scanned_page('${A}', '${ids.book}', null, 'm', 'v', '${page}'::jsonb)`), (r, e) => !!e && /duplicate|unique/i.test(e.message));
const otherLesson = (await db.query("select id from lessons where title_ar = 'التاء'")).rows[0].id;
await expect("lesson from another book is rejected", () => db.query(`select save_scanned_page('${A}', '${ids.book}', '${otherLesson}', 'm', 'v', '{"page_number": 50, "items": []}'::jsonb)`), (r, e) => !!e && /does not belong/.test(e.message));

// Corrections: editors make a new card version and resolve reports.
const card1 = "00000000-0000-0000-0000-0000000000c1";
const reportId = (await db.query("select id from reports limit 1")).rows[0].id;
await expect("app cannot call correct_card", () => as(A, `select correct_card('${A}', '${card1}', '{}'::jsonb, 'x')`), denied);
await expect("student cannot correct a card", () => db.query(`select correct_card('${B}', '${card1}', '{"english":"x"}'::jsonb, 'x')`), (r, e) => !!e && /Only editors/.test(e.message));
await expect("editor of another book cannot correct it", () => db.query(`select correct_card('${C}', '${card1}', '{"english":"x"}'::jsonb, 'x')`), (r, e) => !!e && /Only editors/.test(e.message));
await expect("editor correction makes version 2", () => db.query(`select correct_card('${A}', '${card1}', '{"english":"a book","needs_checking":false}'::jsonb, 'teacher said so', '${reportId}') as v`), (r) => r && r.rows[0].v === 2);
await expect("students see the corrected card", () => as(B, `select english, current_version from current_cards where id = '${card1}'`), (r) => r && r.rows[0]?.english === "a book" && r.rows[0]?.current_version === 2);
await expect("unchanged fields carry over", () => as(B, `select pronunciation from current_cards where id = '${card1}'`), (r) => r && r.rows[0]?.pronunciation === "ki-TAAB");
await expect("old version kept as history", () => as(B, `select count(*)::int n from card_versions where card_id = '${card1}'`), count(2));
await expect("the report is marked accepted", () => as(B, `select status from reports where id = '${reportId}'`), (r) => r && r.rows[0]?.status === "accepted");
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${B}', false); set role authenticated;
  insert into reports (card_id, card_version, message) values ('${card1}', 2, 'still wrong'); reset role;`);
const report2 = (await db.query("select id from reports where status = 'open'")).rows[0].id;
await expect("student cannot dismiss a report", () => db.query(`select dismiss_report('${B}', '${report2}')`), (r, e) => !!e);
await expect("editor dismisses a report", () => db.query(`select dismiss_report('${A}', '${report2}')`).then(() => db.query(`select status from reports where id = '${report2}'`)), (r) => r && r.rows[0]?.status === "rejected");

// Anonymous (not signed in).
await db.exec("reset role; set role anon;");
await expect("anonymous sees no books", () => db.query("select * from books"), rows(0));
await expect("anonymous cannot redeem invites", () => db.query("select redeem_invite('abc12345')"), denied);
await db.exec("reset role");

console.log(failures ? `\n${failures} FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
