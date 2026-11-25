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

test("Alternativtext bei rein numerischen Dateinamen nennt Position und Album", () => {
  assert.equal(altTextFromFilename("001.jpg", 1, 2, "Alpha"), "Foto 1 von 2 im Album Alpha");
  assert.equal(altTextFromFilename("00012.JPG", 4, 9, "Beta"), "Foto 4 von 9 im Album Beta");
});
