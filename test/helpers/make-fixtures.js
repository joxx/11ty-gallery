import fs from "node:fs/promises";
import path from "node:path";
import { makePhoto } from "./fixtures.js";

const ziel = "test/fixtures/site";

await fs.mkdir(path.join(ziel, "alpha"), { recursive: true });
await fs.mkdir(path.join(ziel, "beta-2024"), { recursive: true });

await makePhoto(path.join(ziel, "alpha"), "001.jpg", {
  width: 2000,
  height: 1400,
  exif: {
    IFD0: { Make: "TestCam", Model: "X1" },
    IFD2: { DateTimeOriginal: "2024:05:01 10:00:00", FNumber: "2.8", ISO: "400" },
  },
});
await makePhoto(path.join(ziel, "alpha"), "002.jpg", { width: 1600, height: 1200 });
await makePhoto(path.join(ziel, "alpha"), "003.jpg", { width: 1600, height: 1200 });
await makePhoto(path.join(ziel, "beta-2024"), "001.jpg", { width: 1200, height: 900 });

await fs.writeFile(
  path.join(ziel, "alpha", "captions.json"),
  JSON.stringify({ "002.jpg": { alt: "Strand bei Ebbe", caption: "Erster Morgen" } }, null, 2),
);

console.log("Fixtures geschrieben nach", ziel);
