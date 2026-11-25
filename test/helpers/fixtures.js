import path from "node:path";
import sharp from "sharp";

export async function makePhoto(dir, name, options = {}) {
  const { width = 2000, height = 1400, exif } = options;
  const ziel = path.join(dir, name);
  let bild = sharp({
    create: { width, height, channels: 3, background: "#88a0b8" },
  });
  if (exif) bild = bild.withExif(exif);
  await bild.jpeg({ quality: 80 }).toFile(ziel);
  return ziel;
}
