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
