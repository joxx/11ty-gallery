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
