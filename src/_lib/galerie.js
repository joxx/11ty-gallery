export const IMG_URL_PATH = "/img/";

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

export function altTextFromFilename(filename, position, total, albumTitle) {
  const lesbar = ohneEndung(filename).replace(/[-_]+/g, " ").trim();
  const ohneLeerzeichen = lesbar.replace(/ /g, "");
  if (ohneLeerzeichen === "" || KAMERA_NAMENSMUSTER.test(ohneLeerzeichen)) {
    return `Foto ${position} von ${total} im Album ${albumTitle}`;
  }
  return erstGross(lesbar);
}
