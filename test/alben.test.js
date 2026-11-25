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

async function bauen(album, namen) {
  const ordner = path.join(wurzel, "photos", album);
  await fs.mkdir(ordner, { recursive: true });
  for (const name of namen) await makePhoto(ordner, name, { width: 800, height: 600 });
  return ordner;
}

test("Alben entstehen aus Ordnern, alphabetisch, mit Titel und Anzahl", async () => {
  await bauen("alpha", ["001.jpg", "002.jpg", "003.jpg"]);
  await bauen("beta-2024", ["001.jpg"]);

  const alben = await loadAlbums(opts());

  assert.deepEqual(alben.map((a) => a.slug), ["alpha", "beta-2024"]);
  assert.equal(alben[0].title, "Alpha");
  assert.equal(alben[1].title, "Beta 2024");
  assert.equal(alben[0].href, "/alben/alpha/");
  assert.equal(alben[0].count, 3);
  assert.equal(alben[1].count, 1);
});

test("Fotos sind nach Dateiname sortiert, Titelbild ist das erste", async () => {
  await bauen("alpha", ["010.jpg", "002.jpg", "001b.jpg"]);

  const [album] = await loadAlbums(opts());

  assert.deepEqual(album.photos.map((p) => p.filename), ["001b.jpg", "002.jpg", "010.jpg"]);
  assert.equal(album.cover.filename, "001b.jpg");
  assert.equal(album.photos[1].href, "/alben/alpha/002/");
  assert.equal(album.photos[1].slug, "002");
});

test("Unterordner und Nicht-Bilddateien im Album werden ignoriert", async () => {
  const ordner = await bauen("alpha", ["001.jpg"]);
  await fs.mkdir(path.join(ordner, "unterordner"), { recursive: true });
  await makePhoto(path.join(ordner, "unterordner"), "002.jpg", { width: 800, height: 600 });
  await fs.writeFile(path.join(ordner, "notiz.txt"), "kein Bild");

  const [album] = await loadAlbums(opts());

  assert.deepEqual(album.photos.map((p) => p.filename), ["001.jpg"]);
});

test("Ordner mit Unterstrich und leere Alben entfallen", async () => {
  await bauen("alpha", ["001.jpg"]);
  await bauen("_entwuerfe", ["001.jpg"]);
  await fs.mkdir(path.join(wurzel, "photos", "leer"), { recursive: true });

  const alben = await loadAlbums(opts());

  assert.deepEqual(alben.map((a) => a.slug), ["alpha"]);
});

test("captions.json liefert Alt und Unterschrift, Fallback greift sonst", async (t) => {
  const ordner = await bauen("alpha", ["001.jpg", "002.jpg"]);
  await fs.writeFile(path.join(ordner, "captions.json"),
    JSON.stringify({ "002.jpg": { alt: "Strand bei Ebbe", caption: "Erster Morgen" } }));

  const [album] = await loadAlbums(opts());

  assert.equal(album.photos[1].alt, "Strand bei Ebbe");
  assert.equal(album.photos[1].caption, "Erster Morgen");
  assert.equal(album.photos[0].caption, "");
  assert.equal(album.photos[0].alt, "Foto 1 von 2 im Album Alpha");

  const zweiter = await bauen("beta", ["strand-ebbe.jpg", "IMG_9999.jpg"]);
  await fs.writeFile(path.join(zweiter, "captions.json"), "{ kaputt");

  const warn = t.mock.method(console, "warn", () => {});
  resetAlbumsCache();
  const [beta] = (await loadAlbums(opts())).filter((a) => a.slug === "beta");
  assert.equal(beta.photos[0].alt, "Foto 1 von 2 im Album Beta");
  assert.equal(beta.photos[1].alt, "Strand ebbe");
  assert.ok(warn.mock.callCount() >= 1);
});

test("Vorheriger und nächster Link fehlen an den Enden", async () => {
  await bauen("alpha", ["001.jpg", "002.jpg", "003.jpg"]);
  await bauen("solo", ["001.jpg"]);

  const alben = await loadAlbums(opts());
  const [alpha, solo] = alben;

  assert.equal(alpha.photos[0].prevHref, null);
  assert.equal(alpha.photos[0].nextHref, "/alben/alpha/002/");
  assert.equal(alpha.photos[1].prevHref, "/alben/alpha/001/");
  assert.equal(alpha.photos[2].nextHref, null);
  assert.equal(alpha.photos[0].nextLabel, "Nächstes Foto: Foto 2 von 3 im Album Alpha");
  assert.equal(alpha.photos[1].prevLabel, "Vorheriges Foto: Foto 1 von 3 im Album Alpha");

  assert.equal(solo.photos[0].prevHref, null);
  assert.equal(solo.photos[0].nextHref, null);
});

test("fehlendes Foto-Verzeichnis ergibt eine leere Liste", async () => {
  const alben = await loadAlbums(opts());
  assert.deepEqual(alben, []);
});

test("loadFotos liefert alle Fotos in Albumreihenfolge", async () => {
  await bauen("alpha", ["001.jpg", "002.jpg"]);
  await bauen("beta", ["001.jpg"]);

  const fotos = await loadFotos(opts());

  assert.deepEqual(fotos.map((f) => `${f.albumSlug}/${f.filename}`),
    ["alpha/001.jpg", "alpha/002.jpg", "beta/001.jpg"]);
});

test("loadAlbums scannt pro Verzeichnis nur einmal", async () => {
  await bauen("alpha", ["001.jpg"]);

  const erst = await loadAlbums(opts());
  const zweit = await loadAlbums(opts());

  assert.equal(erst, zweit);
});

test("Vorlagen dürfen gps nicht referenzieren", async () => {
  const vorlagen = path.join(wurzel, "vorlagen");
  await fs.mkdir(vorlagen, { recursive: true });
  await fs.writeFile(path.join(vorlagen, "sauber.njk"), "<img alt=\"{{ foto.alt }}\">");
  assert.doesNotThrow(() => assertTemplatesDoNotUseGps(vorlagen));

  await fs.writeFile(path.join(vorlagen, "verraeter.njk"), "<dd>{{ foto.gps.lat }}</dd>");
  assert.throws(() => assertTemplatesDoNotUseGps(vorlagen), /gps/);
});
