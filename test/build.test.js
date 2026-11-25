import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSite } from "./helpers/build.js";

test("baut eine Startseite mit lang=de und noindex", async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "galerie-"));
  await buildSite({ photosDir: "test/fixtures/leer", outDir });
  const html = await fs.readFile(path.join(outDir, "index.html"), "utf8");
  assert.match(html, /<html lang="de"/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
});
