import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import sharp from "sharp";

await rm(new URL("./dist", import.meta.url), { recursive: true, force: true });

const iconSource = new URL("./assets/app-icon.svg", import.meta.url);
const rendererIcon = new URL("./renderer/icon.png", import.meta.url);
const builderIcon = new URL("../build/icon.png", import.meta.url);
const iconPng = await sharp(await readFile(iconSource)).resize(512, 512).png().toBuffer();
await Promise.all([
  mkdir(new URL("../build/", import.meta.url), { recursive: true }),
  writeFile(rendererIcon, iconPng),
  writeFile(builderIcon, iconPng)
]);

const shared = {
  bundle: true,
  sourcemap: true,
  target: "es2022",
  logLevel: "info"
};

await Promise.all([
  build({
    ...shared,
    entryPoints: [new URL("./src/main.ts", import.meta.url).pathname],
    outfile: new URL("./dist/main.cjs", import.meta.url).pathname,
    platform: "node",
    format: "cjs",
    external: ["electron"]
  }),
  build({
    ...shared,
    entryPoints: [new URL("./src/preload.ts", import.meta.url).pathname],
    outfile: new URL("./dist/preload.cjs", import.meta.url).pathname,
    platform: "node",
    format: "cjs",
    external: ["electron"]
  }),
  build({
    ...shared,
    entryPoints: [new URL("./src/renderer.ts", import.meta.url).pathname],
    outfile: new URL("./dist/renderer.js", import.meta.url).pathname,
    platform: "browser",
    format: "iife"
  }),
  build({
    ...shared,
    entryPoints: [new URL("./src/contracts.ts", import.meta.url).pathname],
    outfile: new URL("./dist/contracts.cjs", import.meta.url).pathname,
    platform: "node",
    format: "cjs"
  })
]);
