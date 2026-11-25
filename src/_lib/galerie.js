import exifr from "exifr";
import queueImage, { generateHTML } from "@11ty/eleventy-img";

export const IMG_URL_PATH = "/img/";
export const BREITEN = [400, 800, 1200, 1600];
export const FORMATE = ["avif", "webp", "jpeg"];

const KAMERA_NAMENSMUSTER = /^(img|dsc|dscn|pxl|dji|gopr|mvimg|screenshot)[-_ ]?\d+$/i;

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
  if (ohneLeerzeichen === "" || KAMERA_NAMENSMUSTER.test(ohneLeerzeichen)) {
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
