import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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

const localPath = (value) => fileURLToPath(value);

await Promise.all([
  build({
    ...shared,
    entryPoints: [localPath(new URL("./src/main.ts", import.meta.url))],
    outfile: localPath(new URL("./dist/main.cjs", import.meta.url)),
    platform: "node",
    format: "cjs",
    external: ["electron"]
  }),
  build({
    ...shared,
    entryPoints: [localPath(new URL("./src/preload.ts", import.meta.url))],
    outfile: localPath(new URL("./dist/preload.cjs", import.meta.url)),
    platform: "node",
    format: "cjs",
    external: ["electron"]
  }),
  build({
    ...shared,
    entryPoints: [localPath(new URL("./src/renderer.ts", import.meta.url))],
    outfile: localPath(new URL("./dist/renderer.js", import.meta.url)),
    platform: "browser",
    format: "iife"
  }),
  build({
    ...shared,
    entryPoints: [localPath(new URL("./src/contracts.ts", import.meta.url))],
    outfile: localPath(new URL("./dist/contracts.cjs", import.meta.url)),
    platform: "node",
    format: "cjs"
  })
]);
