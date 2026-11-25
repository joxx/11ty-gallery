import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { makePhoto } from "./helpers/fixtures.js";
import { buildImageMetadata, buildPicture } from "../src/_lib/galerie.js";

test("erzeugt avif, webp und jpeg in vier Breiten", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bilder-"));
  const file = await makePhoto(dir, "001.jpg", { width: 2000, height: 1400 });
  const meta = await buildImageMetadata(file, path.join(dir, "out"));
  assert.deepEqual(Object.keys(meta).sort(), ["avif", "jpeg", "webp"]);
  assert.deepEqual(meta.avif.map((v) => v.width), [400, 800, 1200, 1600]);
  for (const format of ["avif", "webp", "jpeg"]) {
    for (const v of meta[format]) {
      await fs.access(path.join(dir, "out", path.basename(v.url)));
    }
  }
});

test("picture-Markup enthält Quellen, Maße, sizes und alt", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bilder-"));
  const file = await makePhoto(dir, "001.jpg");
  const meta = await buildImageMetadata(file, path.join(dir, "out"));
  const html = buildPicture(meta, { sizes: "(min-width: 40rem) 45vw, 90vw", alt: "Strand bei Ebbe" });
  assert.match(html, /^<picture>/);
  assert.match(html, /type="image\/avif"/);
  assert.match(html, /type="image\/webp"/);
  assert.match(html, /<img[^>]*src="[^"]*\.jpeg"/);
  assert.match(html, /sizes="\(min-width: 40rem\) 45vw, 90vw"/);
  assert.match(html, /alt="Strand bei Ebbe"/);
  assert.match(html, /width="\d+"/);
  assert.match(html, /height="\d+"/);
  assert.match(html, /src="\/img\//);
});

test("loading und fetchpriority landen nur auf dem img", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bilder-"));
  const meta = await buildImageMetadata(await makePhoto(dir, "001.jpg"), path.join(dir, "out"));
  const html = buildPicture(meta, { sizes: "90vw", alt: "x", loading: "eager", fetchPriority: "high" });
  assert.match(html, /<img[^>]*loading="eager"/);
  assert.match(html, /<img[^>]*fetchpriority="high"/);
  assert.equal((html.match(/loading=/g) || []).length, 1);
});
