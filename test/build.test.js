import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSite } from "./helpers/build.js";
import { makePhoto } from "./helpers/fixtures.js";

let aus;
before(async () => {
  aus = await fs.mkdtemp(path.join(os.tmpdir(), "galerie-"));
  await buildSite({ photosDir: "test/fixtures/site", outDir: aus });
});

const lies = (datei) => fs.readFile(path.join(aus, datei), "utf8");

test("baut eine Startseite mit lang=de und noindex", async () => {
  const html = await lies("index.html");
  assert.match(html, /<html lang="de"/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
});

test("Startseite listet Alben mit Titel, Anzahl und Link", async () => {
  const html = await lies("index.html");
  assert.match(html, /href="\/alben\/alpha\/"/);
  assert.match(html, /Alpha/);
  assert.match(html, /3 Fotos/);
  assert.match(html, /href="\/alben\/beta-2024\/"/);
  assert.match(html, /Beta 2024/);
});

test("Albumseite zeigt alle Fotos mit Unterschrift und Links", async () => {
  const html = await lies("alben/alpha/index.html");
  assert.equal((html.match(/<figure/g) || []).length, 3);
  assert.match(html, /href="\/alben\/alpha\/001\/"/);
  assert.match(html, /href="\/alben\/alpha\/003\/"/);
  assert.match(html, /<figcaption>Erster Morgen<\/figcaption>/);
});

test("erstes Rasterbild lädt eifrig, die übrigen lazy", async () => {
  const html = await lies("alben/alpha/index.html");
  const bilder = html.match(/<img[^>]*>/g) || [];
  assert.match(bilder[0], /loading="eager"/);
  assert.match(bilder[0], /fetchpriority="high"/);
  assert.match(bilder[1], /loading="lazy"/);
});

test("Fotoseite zeigt Bild, Unterschrift und Aufnahmedaten", async () => {
  const html = await lies("alben/alpha/001/index.html");
  assert.match(html, /<h1>Foto 1 von 3 im Album Alpha<\/h1>/);
  assert.match(html, /<dl class="exif">/);
  assert.match(html, /TestCam X1/);
  assert.match(html, /2024/);
  assert.match(html, /href="\/alben\/alpha\/"/);
  const bilder = html.match(/<img[^>]*>/g) || [];
  assert.equal(bilder.length, 1);
  assert.match(bilder[0], /loading="eager"/);
});

test("Fotoseite ohne EXIF zeigt keinen leeren EXIF-Block", async () => {
  const html = await lies("alben/alpha/002/index.html");
  assert.match(html, /<h1>Erster Morgen<\/h1>/);
  assert.doesNotMatch(html, /<dl class="exif">/);
  assert.match(html, /href="\/alben\/alpha\/001\/"/);
  assert.match(html, /href="\/alben\/alpha\/003\/"/);
});

test("an den Enden fehlen die Nachbarlinks", async () => {
  const erstes = await lies("alben/alpha/001/index.html");
  assert.doesNotMatch(erstes, /Vorheriges Foto/);
  assert.match(erstes, /Nächstes Foto/);

  const letztes = await lies("alben/alpha/003/index.html");
  assert.match(letztes, /Vorheriges Foto/);
  assert.doesNotMatch(letztes, /Nächstes Foto/);

  const solo = await lies("alben/beta-2024/001/index.html");
  assert.doesNotMatch(solo, /Vorheriges Foto/);
  assert.doesNotMatch(solo, /Nächstes Foto/);
});

test("robots.txt verbietet allen Bots alles", async () => {
  const txt = await lies("robots.txt");
  assert.match(txt, /User-agent: \*/);
  assert.match(txt, /Disallow: \//);
});

test("keine Seite enthält Koordinaten", async () => {
  const alle = ["index.html", "alben/alpha/index.html", "alben/alpha/001/index.html", "alben/alpha/002/index.html"];
  for (const datei of alle) {
    const html = await lies(datei);
    assert.doesNotMatch(html, /latitude|longitude/i, datei);
  }
});

test("leeres Foto-Verzeichnis zeigt einen Hinweis statt eines Fehlers", async () => {
  const leerAus = await fs.mkdtemp(path.join(os.tmpdir(), "galerie-leer-"));
  await buildSite({ photosDir: "test/fixtures/leer", outDir: leerAus });
  const html = await fs.readFile(path.join(leerAus, "index.html"), "utf8");
  assert.match(html, /Noch keine Alben/);
});

test("CSS bringt Fokusring, Reduced-Motion und ein Raster mit", async () => {
  const css = await lies("assets/style.css");
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /outline:\s*(none|0)\b/);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fill/);
});

test("Sprungmarke steht vor dem Kopfbereich", async () => {
  const html = await lies("index.html");
  assert.ok(html.indexOf("skip-link") < html.indexOf("<header"));
});

test("jedes Rasterbild hat einen Alternativtext", async () => {
  const html = await lies("alben/alpha/index.html");
  const bilder = html.match(/<img[^>]*>/g) || [];
  assert.equal(bilder.length, 3);
  for (const img of bilder) assert.match(img, /alt="[^"]+"/);
});

test("Einzahl und Mehrzahl stehen richtig", async () => {
  const html = await lies("index.html");
  assert.match(html, /<span class="alben-anzahl">3 Fotos<\/span>/);
  assert.match(html, /<span class="alben-anzahl">1 Foto<\/span>/);
  assert.doesNotMatch(html, /1 Fotos/);
});

test("Dateinamen mit Leerzeichen und Umlauten erzeugen erreichbare Seiten", async () => {
  const fotos = await fs.mkdtemp(path.join(os.tmpdir(), "galerie-namen-"));
  const album = path.join(fotos, "sonder");
  await fs.mkdir(album, { recursive: true });
  await makePhoto(album, "IMG 1234.JPG", { width: 900, height: 600 });
  await makePhoto(album, "grüße.jpg", { width: 900, height: 600 });

  const ziel = await fs.mkdtemp(path.join(os.tmpdir(), "galerie-namen-aus-"));
  await buildSite({ photosDir: fotos, outDir: ziel });

  const html = await fs.readFile(path.join(ziel, "alben", "sonder", "index.html"), "utf8");
  assert.match(html, /href="\/alben\/sonder\/grüße\/"/);
  assert.match(html, /href="\/alben\/sonder\/IMG 1234\/"/);
  assert.match(html, /alt="Grüße"/);
  for (const seite of ["grüße", "IMG 1234"]) {
    await fs.access(path.join(ziel, "alben", "sonder", seite, "index.html"));
  }
});
