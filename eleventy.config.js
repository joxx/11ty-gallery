import { assertTemplatesDoNotUseGps, buildPicture } from "./src/_lib/galerie.js";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addNunjucksGlobal("buildPicture", buildPicture);
  eleventyConfig.addWatchTarget("src/photos");
  eleventyConfig.on("eleventy.before", () => assertTemplatesDoNotUseGps("src"));
  return { dir: { input: "src", output: "_site", includes: "_includes", data: "_data" } };
}
