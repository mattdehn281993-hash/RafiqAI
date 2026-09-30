// Deploy config must be valid JSON: Vercel rejects the whole deployment otherwise
// ("Invalid vercel.json file provided").
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

for (const file of ["vercel.json", "app/vercel.json"]) {
  test(`${file} is valid JSON with an SPA rewrite`, () => {
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.ok(config.rewrites?.some((r: { destination: string }) => r.destination === "/index.html"));
  });
}

test("root vercel.json builds the app folder", () => {
  const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  assert.equal(config.outputDirectory, "app/dist");
  assert.match(config.buildCommand, /cd app/);
});
