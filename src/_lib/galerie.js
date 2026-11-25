import { readFile, readdir } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import exifr from "exifr";
import queueImage, { generateHTML } from "@11ty/eleventy-img";

export const IMG_URL_PATH = "/img/";
export const BREITEN = [400, 800, 1200, 1600];
export const FORMATE = ["avif", "webp", "jpeg"];

const KAMERA_NAMENSMUSTER = /^(img|dsc|dscn|pxl|dji|gopr|mvimg|screenshot)[-_ ]?\d+$/i;
const NUR_ZAHLEN = /^\d+$/;

function ohneEndung(filename) {
  const punkt = filename.lastIndexOf(".");
  return punkt === -1 ? filename : filename.slice(0, punkt);
}

function erstGross(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function albumTitleFromSlug(slug) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map(erstGross)
    .join(" ");
}

export function photoSlugFromFilename(filename) {
  return ohneEndung(filename);
}

function zahl(wert) {
  const n = typeof wert === "number" ? wert : parseFloat(String(wert));
  return Number.isFinite(n) ? n : null;
}

function datum(wert) {
  if (!wert) return null;
  const d = wert instanceof Date ? wert : new Date(wert);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" });
}

function kamera(make, model) {
  const teile = [make, model].filter(Boolean).map((t) => String(t).trim());
  return [...new Set(teile)].join(" ") || null;
}

function blende(wert) {
  const n = zahl(wert);
  return n === null ? null : `f/${Math.round(n * 10) / 10}`;
}

function belichtungszeit(wert) {
  const n = zahl(wert);
  if (n === null || n <= 0) return null;
  if (n < 1) return `1/${Math.round(1 / n)} s`;
  return `${Math.round(n * 10) / 10} s`;
}

function brennweite(wert) {
  const n = zahl(wert);
  return n === null ? null : `${Math.round(n)} mm`;
}

export function displayExif(raw) {
  if (!raw) return {};
  const felder = {
    date: datum(raw.DateTimeOriginal ?? raw.CreateDate),
    camera: kamera(raw.Make, raw.Model),
    lens: raw.LensModel ? String(raw.LensModel).trim() : null,
    aperture: blende(raw.FNumber),
    shutter: belichtungszeit(raw.ExposureTime),
    iso: zahl(raw.ISO),
    focalLength: brennweite(raw.FocalLength),
  };
  return Object.fromEntries(Object.entries(felder).filter(([, wert]) => wert !== null));
}

export function pluckGps(raw) {
  if (!raw) return null;
  const lat = zahl(raw.latitude);
  const lon = zahl(raw.longitude);
  if (lat === null || lon === null) return null;
  return { lat, lon };
}

export async function readExif(filePath) {
  try {
    return await exifr.parse(filePath, { gps: true });
  } catch (fehler) {
    console.warn(`EXIF nicht lesbar für ${filePath}: ${fehler.message}`);
    return null;
  }
}

export function altTextFromFilename(filename, position, total, albumTitle) {
  const lesbar = ohneEndung(filename).replace(/[-_]+/g, " ").trim();
  const ohneLeerzeichen = lesbar.replace(/ /g, "");
  if (ohneLeerzeichen === "" || NUR_ZAHLEN.test(ohneLeerzeichen) || KAMERA_NAMENSMUSTER.test(ohneLeerzeichen)) {
    return `Foto ${position} von ${total} im Album ${albumTitle}`;
  }
  return erstGross(lesbar);
}

export async function buildImageMetadata(filePath, outputDir) {
  return queueImage(filePath, {
    widths: BREITEN,
    formats: FORMATE,
    outputDir,
    urlPath: IMG_URL_PATH,
    cacheOptions: { duration: "30d" },
  });
}

export function buildPicture(image, opts = {}) {
  const attribute = {};
  if (opts.alt !== undefined) attribute.alt = opts.alt;
  if (opts.sizes) attribute.sizes = opts.sizes;
  if (opts.className) attribute.class = opts.className;
  attribute.loading = opts.loading ?? "lazy";
  attribute.decoding = "async";
  if (opts.fetchPriority) attribute.fetchpriority = opts.fetchPriority;
  return generateHTML(image, attribute);
}

const BILDENDUNGEN = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".avif", ".webp"]);

const memo = new Map();

export function resetAlbumsCache() {
  memo.clear();
}

function alsObjekt(wert) {
  return wert && typeof wert === "object" && !Array.isArray(wert) ? wert : {};
}

async function liesJson(datei, standard) {
  try {
    return JSON.parse(await readFile(datei, "utf8"));
  } catch (fehler) {
    if (fehler.code !== "ENOENT") {
      console.warn(`${datei} nicht lesbar, es gilt der Standard: ${fehler.message}`);
    }
    return standard;
  }
}

async function ladeAlbum(ordner, slug, imgOutputDir) {
  let eintraege;
  try {
    eintraege = await readdir(ordner, { withFileTypes: true });
  } catch (fehler) {
    console.warn(`Album ${slug} nicht lesbar: ${fehler.message}`);
    return null;
  }

  const dateien = eintraege
    .filter((e) => e.isFile() && BILDENDUNGEN.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  if (dateien.length === 0) return null;

  const info = alsObjekt(await liesJson(path.join(ordner, "info.json"), {}));
  const captions = alsObjekt(await liesJson(path.join(ordner, "captions.json"), {}));
  const title = typeof info.title === "string" && info.title.trim() ? info.title.trim() : albumTitleFromSlug(slug);
  const description = typeof info.description === "string" ? info.description.trim() : "";

  const fotos = [];
  for (const filename of dateien) {
    const datei = path.join(ordner, filename);
    const position = fotos.length + 1;
    const eintrag = alsObjekt(captions[filename]);
    try {
      const roh = await readExif(datei);
      const image = await buildImageMetadata(datei, imgOutputDir);
      fotos.push({
        albumSlug: slug,
        filename,
        slug: photoSlugFromFilename(filename),
        href: `/alben/${slug}/${photoSlugFromFilename(filename)}/`,
        alt: typeof eintrag.alt === "string" && eintrag.alt.trim()
          ? eintrag.alt.trim()
          : altTextFromFilename(filename, position, dateien.length, title),
        caption: typeof eintrag.caption === "string" ? eintrag.caption.trim() : "",
        exif: displayExif(roh),
        gps: pluckGps(roh),
        image,
      });
    } catch (fehler) {
      console.warn(`Bild ${datei} übersprungen: ${fehler.message}`);
    }
  }

  if (fotos.length === 0) return null;

  fotos.forEach((foto, i) => {
    const vorher = fotos[i - 1] ?? null;
    const nachher = fotos[i + 1] ?? null;
    foto.prevHref = vorher ? vorher.href : null;
    foto.nextHref = nachher ? nachher.href : null;
    foto.prevLabel = vorher ? `Vorheriges Foto: ${vorher.alt}` : null;
    foto.nextLabel = nachher ? `Nächstes Foto: ${nachher.alt}` : null;
  });

  return {
    slug,
    title,
    description,
    href: `/alben/${slug}/`,
    count: fotos.length,
    cover: fotos[0],
    photos: fotos,
  };
}

export async function loadAlbums(options = {}) {
  const photosDir = path.resolve(options.photosDir ?? process.env.GALERIE_PHOTOS_DIR ?? "src/photos");
  const imgOutputDir = options.imgOutputDir ?? process.env.GALERIE_IMG_OUTPUT_DIR ?? "_site/img";
  const schluessel = `${photosDir}|${imgOutputDir}`;
  if (!memo.has(schluessel)) {
    memo.set(schluessel, ladeAlben(photosDir, imgOutputDir));
  }
  return memo.get(schluessel);
}

async function ladeAlben(photosDir, imgOutputDir) {
  let eintraege;
  try {
    eintraege = await readdir(photosDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const slugs = eintraege
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const alben = [];
  for (const slug of slugs) {
    const album = await ladeAlbum(path.join(photosDir, slug), slug, imgOutputDir);
    if (album) alben.push(album);
  }
  return alben;
}

export async function loadFotos(options = {}) {
  const alben = await loadAlbums(options);
  return alben.flatMap((album) => album.photos);
}

export function assertTemplatesDoNotUseGps(templatesDir) {
  const treffer = [];
  for (const datei of njkDateien(templatesDir)) {
    if (/\bgps\b/.test(readFileSync(datei, "utf8"))) treffer.push(datei);
  }
  if (treffer.length > 0) {
    throw new Error(`Vorlagen dürfen gps nicht referenzieren (GPS wird nie ausgeliefert): ${treffer.join(", ")}`);
  }
}

function njkDateien(dir) {
  const gefunden = [];
  for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
    const pfad = path.join(dir, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...njkDateien(pfad));
    else if (eintrag.name.endsWith(".njk")) gefunden.push(pfad);
  }
  return gefunden;
}
