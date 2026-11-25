# Bildgalerie mit Eleventy — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine statische, barrierefreie Bildgalerie, bei der jeder Ordner unter `src/photos/` automatisch ein Album mit eigener Seite und Fotoseiten wird.

**Architecture:** Ein ES-Modul (`src/_lib/galerie.js`) scannt die Fotoordner, liest EXIF mit `exifr`, erzeugt AVIF/WebP/JPEG-Varianten mit `@11ty/eleventy-img` und liefert fertige Album- und Fotoobjekte. Zwei Data-Files (`albums.js`, `fotos.js`) geben diese Objekte an drei Nunjucks-Templates weiter. Das Modul merkt sich sein Ergebnis, damit pro Build nur einmal gescannt und jedes Bild nur einmal verarbeitet wird. Kein JavaScript im Browser, ein einziges CSS.

**Tech Stack:** Node ≥ 20 (ESM), Eleventy 3.1, `@11ty/eleventy-img` 7.1, `sharp` 0.35, `exifr` 7.1, Nunjucks, Tests mit `node:test` (keine zusätzlichen Dev-Abhängigkeiten).

**Spec:** `docs/superpowers/specs/2026-11-25-bildgalerie-design.md`

## Global Constraints

- Alben entstehen aus Ordnern: `src/photos/urlaub-2024/` → `/alben/urlaub-2024/`; Ordnername = Slug
- 40–60 Bilder pro Album müssen ohne Zutun funktionieren
- Varianten: Breiten `400, 800, 1200, 1600` px, Formate `avif`, `webp`, `jpeg`, Ausgabe nach `_site/img/`, URL-Pfad `/img/`
- Kein JavaScript im ausgelieferten Projekt; kein CSS-Framework; kein Webfont
- `<meta name="robots" content="noindex, nofollow">` auf jeder Seite, `robots.txt` mit `User-agent: *` / `Disallow: /`
- GPS-Koordinaten werden gelesen und in den Build-Daten gehalten, aber nie gerendert
- Alternativtexte werden nie erfunden
- Unlesbare Bilddatei: Warnung und überspringen, kein Abbruch
- Unterordner innerhalb eines Albums werden ignoriert; Ordner mit `_`-Präfix werden übersprungen; leere Alben erzeugen keine Seite
- Originale werden nicht nach `_site` kopiert
- `_site` wird vor jedem Build geleert, `.cache/eleventy-img` bleibt erhalten
- Sprache `de`, `lang="de"`

**Feste Umgebungsschnittstellen** (damit Tests mit Fixture-Ordnern bauen können):

| Variable | Standard | Zweck |
|---|---|---|
| `GALERIE_PHOTOS_DIR` | `src/photos` | Wo die Albumordner liegen |
| `GALERIE_IMG_OUTPUT_DIR` | `_site/img` | Wohin die Varianten geschrieben werden |

Der URL-Pfad der Varianten ist immer `/img/` (Konstante `IMG_URL_PATH`).

## Review Focus

Diese Fälle deckt die Spec nicht ausdrücklich ab. Jeder bekommt in der genannten Task einen Test:

1. `src/photos` existiert nicht oder ist leer — die Übersicht baut mit Hinweistext statt abzustürzen (Task 5, 6)
2. Dateinamen mit Großbuchstaben, Leerzeichen, Umlauten (`IMG 1234.JPG`, `grüße.jpg`) — Slug und URL bleiben gültig (Task 2)
3. Foto ohne jegliche EXIF-Daten — EXIF-Block entfällt vollständig, kein `undefined` im HTML (Task 3, 6)
4. Album mit genau einem Foto — weder Vorheriger- noch Nächster-Link, kein Selbstverweis (Task 5)
5. Fehlende oder kaputte `captions.json` — Build läuft weiter, Fallback-Alt greift (Task 5)

---

### Task 1: Projektgerüst mit baubarer Startseite

**Files:**
- Create: `package.json`, `eleventy.config.js`, `.gitignore`
- Create: `src/index.njk`, `src/_includes/base.njk`, `src/assets/style.css`
- Create: `test/build.test.js`, `test/helpers/build.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `package.json` mit `"type": "module"` und Skripten `build` (`rm -rf _site && eleventy`), `serve` (`eleventy --serve`), `test` (`node --test test/`)
  - `test/helpers/build.js`: `export async function buildSite({ photosDir, outDir })` — führt `npx @11ty/eleventy --input=src --output=<outDir>` mit gesetzten Env-Variablen `GALERIE_PHOTOS_DIR`/`GALERIE_IMG_OUTPUT_DIR` aus, wirft bei Exit-Code ≠ 0
  - `base.njk` mit Blöcken `content` und `title`

- [ ] **Step 1: Abhängigkeiten installieren**

```bash
npm init -y && npm pkg set type=module
npm i -D @11ty/eleventy@^3.1.8
npm i @11ty/eleventy-img@^7.1.1 exifr@^7.1.3
npm pkg set scripts.build="rm -rf _site && eleventy" scripts.serve="eleventy --serve" scripts.test="node --test test/"
```

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

`test/build.test.js`:

```js
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
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npm test`
Expected: FAIL — `Cannot find module './helpers/build.js'`

- [ ] **Step 4: Gerüst anlegen**

`test/helpers/build.js`:

```js
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function buildSite({ photosDir, outDir }) {
  await run("npx", ["@11ty/eleventy", "--input=src", `--output=${outDir}`], {
    env: {
      ...process.env,
      GALERIE_PHOTOS_DIR: photosDir,
      GALERIE_IMG_OUTPUT_DIR: `${outDir}/img`,
    },
  });
}
```

`eleventy.config.js`:

```js
export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addWatchTarget("src/photos");
  return { dir: { input: "src", output: "_site", includes: "_includes", data: "_data" } };
}
```

`src/_includes/base.njk`:

```njk
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>{% if title %}{{ title }} — {% endif %}Bildergalerie</title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <a class="skip-link" href="#inhalt">Zum Inhalt</a>
  <header class="kopf"><a href="/">Bildergalerie</a></header>
  <main id="inhalt" tabindex="-1">
    {{ content | safe }}
  </main>
</body>
</html>
```

`src/index.njk` (Platzhalter, wird in Task 6 ersetzt):

```njk
---
layout: base.njk
title: Alben
---
<h1>Alben</h1>
```

`src/assets/style.css`: leer anlegen.
`test/fixtures/leer/`: leerer Ordner, mit `.gitkeep` damit git ihn behält.
`.gitignore`: `node_modules/`, `_site/`, `.cache/`.

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npm test`
Expected: PASS (1 Test)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: Eleventy-Gerüst mit Basis-Layout und Testharness"
```

---

### Task 2: Slug-, Titel- und Alternativtext-Regeln

**Files:**
- Create: `src/_lib/galerie.js`
- Create: `test/galerie.test.js`

**Interfaces:**
- Consumes: nichts
- Produces (alle aus `src/_lib/galerie.js` exportiert):
  - `export const IMG_URL_PATH = "/img/"`
  - `export function albumTitleFromSlug(slug: string): string` — `"urlaub-2024"` → `"Urlaub 2024"`
  - `export function photoSlugFromFilename(filename: string): string` — `"001.JPG"` → `"001"`, `"grüße.jpg"` → `"grüße"`
  - `export function altTextFromFilename(filename: string, position: number, total: number, albumTitle: string): string`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`test/galerie.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { albumTitleFromSlug, photoSlugFromFilename, altTextFromFilename } from "../src/_lib/galerie.js";

test("Albumtitel aus Ordnernamen", () => {
  assert.equal(albumTitleFromSlug("urlaub-2024"), "Urlaub 2024");
  assert.equal(albumTitleFromSlug("weihnachten_bei_oma"), "Weihnachten Bei Oma");
  assert.equal(albumTitleFromSlug("berlin"), "Berlin");
});

test("Foto-Slug behält Umlaute und lässt die Endung weg", () => {
  assert.equal(photoSlugFromFilename("001.JPG"), "001");
  assert.equal(photoSlugFromFilename("grüße.jpg"), "grüße");
  assert.equal(photoSlugFromFilename("IMG 1234.JPG"), "IMG 1234");
});

test("Alternativtext aus beschreibendem Dateinamen", () => {
  assert.equal(altTextFromFilename("strand-ebbe.jpg", 3, 47, "Urlaub 2024"), "Strand ebbe");
});

test("Alternativtext bei Kamera-Vorgaben nennt Position und Album", () => {
  for (const name of ["IMG_1234.JPG", "DSC01234.jpg", "PXL_20240501.jpg", "GOPR0001.jpg"]) {
    assert.equal(altTextFromFilename(name, 3, 47, "Urlaub 2024"), "Foto 3 von 47 im Album Urlaub 2024");
  }
  assert.equal(altTextFromFilename("IMG 1234.JPG", 1, 2, "Test"), "Foto 1 von 2 im Album Test");
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test test/galerie.test.js`
Expected: FAIL — `Cannot find module '../src/_lib/galerie.js'`

- [ ] **Step 3: Die drei Funktionen in `src/_lib/galerie.js` implementieren**

Signatur und Regeln: Trenner `-` und `_` werden zu Leerzeichen, jedes Wort bekommt einen großen Anfangsbuchstaben, der Rest bleibt unverändert. `photoSlugFromFilename` entfernt nur die letzte Endung und behält sonst alles. `altTextFromFilename` entfernt die Endung, ersetzt `[-_]+` durch Leerzeichen, schneidet Leerraum ab und setzt den ersten Buchstaben groß; entspricht das Ergebnis (ohne Leerzeichen) `^(img|dsc|dscn|pxl|dji|gopr|mvimg|screenshot)[-_ ]?\d+$/i` oder ist es leer, kommt `Foto {position} von {total} im Album {albumTitle}` zurück.

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `node --test test/galerie.test.js`
Expected: PASS (4 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/_lib/galerie.js test/galerie.test.js && git commit -m "feat: Slug-, Titel- und Alternativtext-Regeln"
```

---

### Task 3: EXIF-Whitelist und GPS-Trennung

**Files:**
- Modify: `src/_lib/galerie.js`
- Modify: `test/galerie.test.js`

**Interfaces:**
- Consumes: nichts aus Task 2
- Produces:
  - `export function displayExif(raw: object | null): { date?: string, camera?: string, lens?: string, aperture?: string, shutter?: string, iso?: number, focalLength?: string }` — nur vorhandene Felder; leer, wenn keine Daten
  - `export function pluckGps(raw: object | null): { lat: number, lon: number } | null`
  - `export async function readExif(filePath: string): Promise<object | null>` — `exifr.parse(filePath, { gps: true })`, fängt Lesefehler und gibt `null` zurück

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

An `test/galerie.test.js` anhängen:

```js
import { displayExif, pluckGps } from "../src/_lib/galerie.js";

const roh = {
  DateTimeOriginal: new Date("2024-05-01T10:00:00Z"),
  Make: "TestCam", Model: "X1",
  LensModel: "18-55mm",
  FNumber: 2.8, ExposureTime: 1 / 250, ISO: 400, FocalLength: 35,
  latitude: 52.52, longitude: 13.405,
};

test("EXIF-Anzeige enthält nur die Whitelist-Felder", () => {
  const e = displayExif(roh);
  assert.deepEqual(Object.keys(e).sort(),
    ["aperture", "camera", "date", "focalLength", "iso", "lens", "shutter"]);
  assert.equal(e.camera, "TestCam X1");
  assert.equal(e.aperture, "f/2.8");
  assert.equal(e.shutter, "1/250 s");
  assert.equal(e.iso, 400);
  assert.equal(e.focalLength, "35 mm");
  assert.match(e.date, /2024/);
  assert.equal("latitude" in e, false);
  assert.equal("gps" in e, false);
});

test("EXIF-Anzeige ohne Daten ist leer, nicht undefined", () => {
  assert.deepEqual(displayExif(null), {});
  assert.deepEqual(displayExif({ Make: "TestCam" }), { camera: "TestCam" });
});

test("GPS wird getrennt ausgelesen", () => {
  assert.deepEqual(pluckGps(roh), { lat: 52.52, lon: 13.405 });
  assert.equal(pluckGps(null), null);
  assert.equal(pluckGps({ Make: "TestCam" }), null);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test test/galerie.test.js`
Expected: FAIL — `displayExif is not a function`

- [ ] **Step 3: Implementieren**

Formatregeln: `date` als `neues Date(...).toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" })`; `camera` = `Make` und `Model` mit einem Leerzeichen, Duplikate nicht doppelt; `aperture` = `f/` + Zahl; `shutter` = `1/250 s` (bei Werten unter 1 s als Bruch, sonst `2 s`); `focalLength` = Zahl + ` mm`. Fehlt ein Wert, wird der Schlüssel weggelassen — nie `undefined`, nie `"unbekannt"`.

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `node --test test/galerie.test.js`
Expected: PASS (7 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/_lib/galerie.js test/galerie.test.js && git commit -m "feat: EXIF-Whitelist für die Anzeige, GPS separat"
```

---

### Task 4: Bildvarianten und `<picture>`-Markup

**Files:**
- Modify: `src/_lib/galerie.js`
- Create: `test/helpers/fixtures.js`
- Create: `test/bilder.test.js`

**Interfaces:**
- Consumes: `IMG_URL_PATH` aus Task 2
- Produces:
  - `test/helpers/fixtures.js`: `export async function makePhoto(dir: string, name: string, options?: { width?: number, height?: number, exif?: object }): Promise<string>` — schreibt mit `sharp` ein JPEG (Standard 2000×1400); `exif` wird per `withExif` gesetzt
  - `export async function buildImageMetadata(filePath: string, outputDir: string): Promise<object>` — gibt die `eleventy-img`-Metadaten zurück
  - `export function buildPicture(image: object, opts: { sizes: string, alt: string, className?: string, loading?: "lazy" | "eager", fetchPriority?: "high" | "auto" }): string`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`test/bilder.test.js`:

```js
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
  assert.match(html, /type="image\/jpeg"/);
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
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test test/bilder.test.js`
Expected: FAIL — `Cannot find module './helpers/fixtures.js'`

- [ ] **Step 3: Implementieren**

`buildImageMetadata` ruft `Image(filePath, { widths: [400, 800, 1200, 1600], formats: ["avif", "webp", "jpeg"], outputDir, urlPath: IMG_URL_PATH, cacheOptions: { duration: "30d" } })` auf und gibt die Metadaten zurück. `buildPicture` baut die Attribute (`alt`, `sizes`, `class`, `loading`, `fetchpriority`) und ruft `Image.generateHTML(image, attributes)`; `loading` und `fetchpriority` gehören ausschließlich an das `<img>`, nicht an `<source>`.

`test/helpers/fixtures.js`: `makePhoto` nimmt `sharp({ create: { width, height, channels: 3, background: "#88a" } })`, optional `.withExif(exif)` und schreibt `.jpeg()` nach `path.join(dir, name)`.

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `node --test test/bilder.test.js`
Expected: PASS (3 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/_lib/galerie.js test/helpers/fixtures.js test/bilder.test.js && git commit -m "feat: Bildvarianten in AVIF/WebP/JPEG und picture-Markup"
```

---

### Task 5: Alben und Fotos aus Ordnern laden

**Files:**
- Modify: `src/_lib/galerie.js`
- Create: `test/alben.test.js`

**Interfaces:**
- Consumes: `albumTitleFromSlug`, `photoSlugFromFilename`, `altTextFromFilename`, `displayExif`, `pluckGps`, `readExif`, `buildImageMetadata`
- Produces:
  - Fotoobjekt: `{ albumSlug, filename, slug, href, alt, caption, exif, gps, image, prevHref, nextHref, prevLabel, nextLabel }`
  - Albumobjekt: `{ slug, title, description, href, count, cover, photos }`
  - `export async function loadAlbums(options?: { photosDir?: string, imgOutputDir?: string }): Promise<Album[]>` — Ergebnis wird pro Prozess gemerkt
  - `export async function loadFotos(options?): Promise<Photo[]>` — flache Liste aller Fotos in Albumreihenfolge
  - `export function resetAlbumsCache(): void` — für Tests
  - `export function assertTemplatesDoNotUseGps(templatesDir: string): void` — wirft `Error`, wenn eine `.njk`-Datei `gps` enthält

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`test/alben.test.js` mit diesen Fällen:

```js
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { makePhoto } from "./helpers/fixtures.js";
import { loadAlbums, loadFotos, resetAlbumsCache, assertTemplatesDoNotUseGps } from "../src/_lib/galerie.js";

let wurzel;
beforeEach(async () => {
  resetAlbumsCache();
  wurzel = await fs.mkdtemp(path.join(os.tmpdir(), "alben-"));
});
const opts = () => ({ photosDir: path.join(wurzel, "photos"), imgOutputDir: path.join(wurzel, "img") });

// 1 Alben entstehen aus Ordnern, alphabetisch, mit Titel und Anzahl
// 2 Reihenfolge nach Dateiname, cover ist das erste Foto
// 3 Unterordner und Nicht-Bilddateien im Album werden ignoriert
// 4 Ordner mit "_"-Praefix und leere Alben entfallen
// 5 captions.json: alt und caption werden uebernommen; fehlende Datei und
//   kaputtes JSON fallen auf den Dateinamen-Alt zurueck (kein Wurf)
// 6 prevHref/nextHref: erstes Foto hat kein prevHref, letztes kein nextHref;
//   Album mit einem Foto hat beide null; Labels enthalten den Alternativtext
// 7 fehlendes photos-Verzeichnis ergibt [] statt Fehler
// 8 assertTemplatesDoNotUseGps wirft bei einer Vorlage mit "foto.gps",
//   schweigt bei sauberen Vorlagen
// 9 loadAlbums zweimal aufgerufen scannt nur einmal (Zaehler ueber
//   fs.readdir-Spy ist optional; geprueft wird Identitaet: zweites Ergebnis
//   ist dasselbe Array-Objekt)
```

Jeder Fall mit konkreten Werten: zwei Alben `alpha/` (3 Fotos `001.jpg`, `002.jpg`, `003.jpg`) und `beta-2024/` (1 Foto `001.jpg`), Erwartung `["alpha", "beta-2024"]`, `href === "/alben/alpha/"`, Foto-`href === "/alben/alpha/002/"`, `nextLabel === "Nächstes Foto: Strand ebbe"` bei entsprechendem Alt.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test test/alben.test.js`
Expected: FAIL — `loadAlbums is not a function`

- [ ] **Step 3: `loadAlbums` und `loadFotos` implementieren**

Ablauf pro Albumordner: `fs.readdir(dir, { withFileTypes: true })`; Verzeichnisse ignorieren; nur Dateien mit Endung aus `.jpg .jpeg .png .tif .tiff .avif .webp` (case-insensitiv) behalten; nach Dateiname mit `localeCompare` sortieren; `captions.json` lesen (`JSON.parse` in `try/catch`, Fehler → `{}` + `console.warn`); `info.json` lesen (`title`, `description`); pro Bild `readExif` und `buildImageMetadata` (Fehler → `console.warn` und Bild überspringen); Album mit 0 Fotos überspringen. `imgOutputDir` und `photosDir` kommen aus den Optionen, sonst aus den Env-Variablen (`GALERIE_PHOTOS_DIR`, `GALERIE_IMG_OUTPUT_DIR`). `href` ist `/alben/${albumSlug}/${photoSlug}/`.

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `node --test test/alben.test.js`
Expected: PASS (9 Fälle)

- [ ] **Step 5: Commit**

```bash
git add src/_lib/galerie.js test/alben.test.js && git commit -m "feat: Alben und Fotos aus Ordnern laden, inkl. Vor/Zurück"
```

---

### Task 6: Seiten, Vorlagen und robots.txt

**Files:**
- Modify: `src/_lib/galerie.js` (nur falls nötig), `eleventy.config.js`
- Create: `src/_data/albums.js`, `src/_data/fotos.js`
- Create: `src/_includes/raster.njk`, `src/_includes/exif.njk`
- Modify: `src/index.njk`
- Create: `src/album.njk`, `src/foto.njk`, `src/robots.txt`
- Create: `test/helpers/make-fixtures.js`, `test/fixtures/site/` (Alben `alpha` und `beta-2024`)
- Modify: `test/build.test.js`

**Interfaces:**
- Consumes: `loadAlbums`, `loadFotos`, `buildPicture`, `Photo`/`Album`-Formen aus Task 5
- Produces: fertige Seiten unter `/`, `/alben/<slug>/`, `/alben/<slug>/<foto>/`; `robots.txt` in `_site`; `assertTemplatesDoNotUseGps` wird beim Build in `eleventy.before` aufgerufen

- [ ] **Step 1: Fixture-Alben erzeugen und committen**

`test/helpers/make-fixtures.js` (einmalig per `node test/helpers/make-fixtures.js` ausführen):

- `test/fixtures/site/alpha/001.jpg` mit EXIF `{ IFD0: { Make: "TestCam", Model: "X1" }, IFD2: { DateTimeOriginal: "2024:05:01 10:00:00", FNumber: 2.8, ISO: 400 } }`, 2000×1400
- `test/fixtures/site/alpha/002.jpg` und `003.jpg` ohne EXIF, 1600×1200
- `test/fixtures/site/alpha/captions.json` mit `{ "002.jpg": { "alt": "Strand bei Ebbe", "caption": "Erster Morgen" } }`
- `test/fixtures/site/beta-2024/001.jpg` ohne EXIF, 1200×900

Prüfen, dass das EXIF lesbar ankommt:

Run: `node -e "import('exifr').then(async m => console.log(await m.default.parse('test/fixtures/site/alpha/001.jpg')))"`
Expected: Ausgabe enthält `Make: 'TestCam'` und `DateTimeOriginal`. Kommt kein EXIF an, ist das ein Blocker und muss gemeldet werden, nicht umgangen.

- [ ] **Step 2: Die fehlschlagenden Tests schreiben**

An `test/build.test.js` anhängen (Fixture-Site mit zwei Alben bauen, wie in Task 5, aber im Projektordner `test/fixtures/site`):

```js
// index.html: Albumtitel als Link auf /alben/alpha/, Bildanzahl
// alben/alpha/index.html: 3 figure mit figcaption, 3 Links auf Fotoseiten,
//   erstes img mit fetchpriority="high" und loading="eager", danach lazy
// alben/alpha/002/index.html: h1, exif-dl mit Datum, prev+next Links,
//   img ohne loading="lazy"
// alben/alpha/001/index.html: kein "Vorheriges Foto"-Link
// alben/beta-2024/001/index.html: weder vorher noch nachher
// robots.txt: "User-agent: *" und "Disallow: /"
// keine Seite enthaelt "latitude" oder "longitude"
// alben/alpha/001: dl.exif mit "TestCam X1" und "2024"
// alben/alpha/002: kein <dl class="exif"> (keine EXIF-Daten)
// leeres photos-Verzeichnis: index.html enthaelt "Noch keine Alben"
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npm test`
Expected: FAIL — `ENOENT` für `alben/alpha/index.html`

- [ ] **Step 4: Data-Files und Vorlagen schreiben**

`src/_data/albums.js`: `export default () => loadAlbums()`. `src/_data/fotos.js`: `export default () => loadFotos()`.

`src/index.njk`: `h1` „Alben"; pro Album `<article>` mit Titelbild (`buildPicture(album.cover.image, { sizes: "(min-width: 40rem) 20rem, 90vw", alt: album.cover.alt, loading: "lazy" })`), Link auf `album.href` mit `album.title`, Text `{{ album.count }} Fotos`, optionale Beschreibung; bei `albums.length === 0` ein Absatz „Noch keine Alben — lege einen Ordner unter `src/photos/` an."

`src/album.njk`: Front Matter `layout: base.njk`, `pagination: { data: "albums", size: 1, alias: "album" }`, `permalink: "/alben/{{ album.slug }}/"`, `eleventyComputed: { title: (data) => data.album.title }`. Inhalt: `h1` mit Albumtitel, optionale Beschreibung, `raster.njk` einbinden.

`src/foto.njk`: Front Matter `layout: base.njk`, `pagination: { data: "fotos", size: 1, alias: "foto" }`, `permalink: "{{ foto.href }}"`, `eleventyComputed: { title: (data) => data.foto.caption || data.foto.alt }`. Inhalt: `h1` mit `foto.caption` oder `foto.alt`, Bild mit `sizes: "(min-width: 64rem) 60rem, 92vw"` und `loading: "eager"`, optional `<figcaption>` nur wenn `foto.caption`, `exif.njk` nur wenn `foto.exif` nicht leer, Link „Zurück zum Album" auf `/alben/{{ foto.albumSlug }}/`, `nav` mit bedingten Links auf `foto.prevHref`/`foto.nextHref` und den Labels `foto.prevLabel`/`foto.nextLabel`.

`src/_includes/raster.njk`: `ul`/`li` oder `div`-Raster, je Eintrag `figure` mit Link auf `foto.href`, Bild über `buildPicture(..., { sizes: "(min-width: 64rem) 20rem, (min-width: 40rem) 45vw, 90vw", alt: foto.alt, loading: loop.first ? "eager" : "lazy", fetchPriority: loop.first ? "high" : "auto" })`, `figcaption` nur wenn `foto.caption`. `buildPicture` wird als globale Funktion bereitgestellt — in `eleventy.config.js` per `eleventyConfig.addNunjucksGlobal("buildPicture", buildPicture)`.

`src/_includes/exif.njk`: `dl` mit `dt`/`dd`-Paaren für vorhandene Schlüssel in fester Reihenfolge: date → „Aufgenommen", camera → „Kamera", lens → „Objektiv", aperture → „Blende", shutter → „Belichtungszeit", iso → „ISO", focalLength → „Brennweite".

`src/robots.txt`: `User-agent: *` / `Disallow: /`; in `eleventy.config.js` per `addPassthroughCopy("src/robots.txt")`.

`eleventy.config.js` ergänzen: `eleventyConfig.on("eleventy.before", () => assertTemplatesDoNotUseGps("src"))`.

- [ ] **Step 5: Tests laufen lassen, Erfolg bestätigen**

Run: `npm test`
Expected: PASS (alle bisherigen Tests plus die neuen Seitenfälle)

- [ ] **Step 6: Echten Build mit leerem `src/photos` prüfen**

Run: `mkdir -p src/photos && npm run build`
Expected: Build endet ohne Fehler, `_site/index.html` enthält „Noch keine Alben", `_site/robots.txt` existiert

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: Albenübersicht, Album- und Fotoseiten, robots.txt"
```

---

### Task 7: Vanilla CSS und Barrierefreiheits-Feinschliff

**Files:**
- Modify: `src/assets/style.css`, `src/_includes/base.njk`, `src/_includes/raster.njk`, `src/foto.njk`
- Modify: `test/build.test.js`

**Interfaces:**
- Consumes: Markup-Klassen aus Task 6
- Produces: `style.css` mit den im Design geforderten Regeln; unverändertes Markup außer Klassen

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

```js
// style.css enthaelt ":focus-visible" und "prefers-reduced-motion"
// style.css enthaelt kein "outline: none" und kein "outline: 0"
// style.css nutzt "grid-template-columns: repeat(auto-fill"
// index.html enthaelt "skip-link" als erstes fokussierbares Element (vor <header>)
// alben/alpha/index.html: jedes figure hat figcaption oder das Bild hat alt !== ""
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npm test`
Expected: FAIL — `:focus-visible` fehlt

- [ ] **Step 3: CSS schreiben**

Custom Properties (`--farbe-text`, `--farbe-hintergrund`, `--farbe-gedaempft`, `--abstand`, `--raster-min: 15rem`), Systemschrift-Stack, `:root`-Farben mit `prefers-color-scheme: dark`-Variante, Kontrast ≥ 4.5:1, `.skip-link` bis zum Fokus visuell verborgen, `.raster` mit `display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--raster-min), 1fr)); gap: var(--abstand)`, Bilder `max-width: 100%; height: auto`, `figcaption` in gedempfter Farbe mit ausreichendem Kontrast, Links mit `min-height: 44px` Trefferfläche im Raster, `:focus-visible` mit sichtbarem Ring, Übergänge nur innerhalb `@media (prefers-reduced-motion: no-preference)`.

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Sichtprüfung im Browser**

Run: `npm run serve`, Seite unter `http://localhost:8080` öffnen und prüfen: Tastatur-Tab zeigt sichtbaren Fokus, Sprungmarke erscheint beim ersten Tab, Raster bricht bei schmalem Fenster um, kein horizontales Scrollen bei 200 % Zoom. Ergebnis im Commit-Text vermerken.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Vanilla CSS, Raster und Tastatur-Fokus"
```

---

### Task 8: README mit Bedienungsanleitung

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: Verhalten aus Task 1–7
- Produces: Anleitung, die ohne Rückfragen benutzbar ist

- [ ] **Step 1: README schreiben**

Inhalt: Voraussetzungen (Node ≥ 20), `npm install`, Album anlegen (`src/photos/<name>/` mit Bildern, optional `info.json` mit `title`/`description`, optional `captions.json` mit `alt`/`caption` je Datei), `npm run build`, `npm run serve`, Upload von `_site` per FTP/SFTP/rsync auf den eigenen Webspace, Hinweis auf `noindex` und darauf, dass GPS-Daten zwar gelesen, aber nicht ausgeliefert werden, sowie der Hinweis, dass Bilder beim ersten Build verarbeitet werden und spätere Builds den Cache nutzen.

- [ ] **Step 2: Anleitung gegen die Wirklichkeit prüfen**

Run: `grep -n "photos" README.md && npm run build`
Expected: README nennt `src/photos/`; Build läuft durch

- [ ] **Step 3: Commit**

```bash
git add README.md && git commit -m "docs: README mit Album-Konvention und Deployment"
```

---

## Selbstprüfung

- Spec-Abdeckung: Alben/Kategorien (T5, T6), Unterschriften (T5, T6), EXIF (T3, T6), GPS ohne Anzeige (T3, T5, T6), responsive Bilder + AVIF (T4), Barrierefreiheit (T6, T7), Vanilla CSS (T7), noindex + eigener Webspace (T1, T6, T8), Build/Cache (T1), Reihenfolge/`_`-Präfix/leere Alben/Unterordner (T5)
- Review Focus: alle fünf Fälle haben eine Task mit Test (siehe Liste oben)
- Schnittstellen: `buildPicture(image, opts)` wird in T4 definiert und in T6/T7 so verwendet; `Photo`/`Album` nur in T5 definiert und in T6 gelesen; `assertTemplatesDoNotUseGps` in T5 definiert, in T6 verdrahtet
