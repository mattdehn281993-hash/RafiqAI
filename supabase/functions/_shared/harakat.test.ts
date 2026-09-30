import { test } from "node:test";
import assert from "node:assert/strict";
import { clusters, diffMarks, printedOnly, skeleton } from "./harakat.ts";

test("clusters attach marks to their letter", () => {
  assert.deepEqual(clusters("كِتَاب"), [
    { base: "ك", marks: ["ِ"] },
    { base: "ت", marks: ["َ"] },
    { base: "ا", marks: [] },
    { base: "ب", marks: [] },
  ]);
});

test("shadda + vowel in either order compare equal", () => {
  const a = "كَرِّرْ"; // shadda then kasra
  const b = "كَرِّرْ"; // kasra then shadda
  const d = diffMarks(a, b);
  assert.equal(d.status, "ok");
  if (d.status === "ok") assert.equal(d.addedCount + d.droppedCount, 0);
});

test("skeleton strips marks and tatweel", () => {
  assert.equal(skeleton("كِتَـــابٌ"), "كتاب");
});

test("hamza on alif is a letter, not a mark", () => {
  assert.equal(skeleton("أُنْظُرْ"), "أنظر");
  assert.equal(skeleton("أنظر"), "أنظر"); // decomposed form normalises
});

test("unvowelled print: every mark is AI-added", () => {
  const d = diffMarks("كتاب", "كِتَابٌ");
  assert.equal(d.status, "ok");
  if (d.status !== "ok") return;
  assert.equal(d.printedCount, 0);
  assert.equal(d.addedCount, 3);
  assert.equal(d.droppedCount, 0);
});

test("partially vowelled print: only missing marks are added", () => {
  const d = diffMarks("كِتاب", "كِتَاب");
  assert.equal(d.status, "ok");
  if (d.status !== "ok") return;
  assert.equal(d.printedCount, 1);
  assert.equal(d.addedCount, 1);
  assert.deepEqual(d.clusters[1].added, ["َ"]);
});

test("a printed mark lost in the full version is reported as dropped", () => {
  const d = diffMarks("كِتَاب", "كتَاب");
  assert.equal(d.status, "ok");
  if (d.status === "ok") assert.equal(d.droppedCount, 1);
});

test("changed letters are caught", () => {
  const d = diffMarks("كتاب", "كِتَابَة");
  assert.equal(d.status, "letters_differ");
});

test("multi-word phrases keep spaces", () => {
  const full = "صَبَاحُ الْخَيْرِ";
  const d = diffMarks("صباح الخير", full);
  assert.equal(d.status, "ok");
  if (d.status !== "ok") return;
  assert.equal(printedOnly(d, full), "صباح الخير");
});

test("punctuation and blank dots are not compared as letters", () => {
  const d = diffMarks("* اُنْظُرْ ، وَلَاحِظْ :", "اُنْظُرْ وَلَاحِظْ");
  assert.equal(d.status, "ok");
  if (d.status === "ok") assert.equal(d.addedCount + d.droppedCount, 0);
  assert.equal(diffMarks("....طِّيخ", "طِّيخ").status, "ok");
});

test("printedOnly keeps punctuation from the full text", () => {
  const full = "اِقْرَأْ ، ثُمَّ صِلْ :";
  const d = diffMarks("اقرأ ، ثم صل :", full);
  assert.equal(d.status, "ok");
  if (d.status === "ok") assert.equal(printedOnly(d, full), "اقرأ ، ثم صل :");
});

test("printedOnly keeps book marks and removes AI marks", () => {
  const full = "كِتَابٌ";
  const d = diffMarks("كِتاب", full);
  assert.equal(d.status, "ok");
  if (d.status === "ok") assert.equal(printedOnly(d, full), "كِتاب");
});
