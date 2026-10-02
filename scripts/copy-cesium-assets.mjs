import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const cesiumBuild = path.join(projectRoot, "node_modules", "cesium", "Build", "Cesium");
const outputDirectory = path.join(projectRoot, "public", "cesium");
const requiredDirectories = ["Assets", "Workers", "ThirdParty", "Widgets"];

mkdirSync(outputDirectory, { recursive: true });

for (const directory of requiredDirectories) {
  cpSync(path.join(cesiumBuild, directory), path.join(outputDirectory, directory), {
    recursive: true,
    force: true,
  });
}

console.log(`Copied Cesium static assets to ${path.relative(projectRoot, outputDirectory)}.`);
