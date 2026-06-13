import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDirectory = path.join(projectRoot, "docs");
const builtIndexPath = path.join(buildDirectory, "index.html");
const outputPath = path.join(projectRoot, "Arrow-Memory-Lab.html");

const html = await readFile(builtIndexPath, "utf8");
const scriptMatch = html.match(
  /<script\s+type="module"[^>]*\ssrc="([^"]+)"[^>]*><\/script>/,
);
const styleMatch = html.match(
  /<link\s+rel="stylesheet"[^>]*\shref="([^"]+)"[^>]*>/,
);

if (!scriptMatch || !styleMatch) {
  throw new Error("Could not find the built JavaScript and CSS assets.");
}

function assetPath(assetUrl) {
  return path.join(buildDirectory, assetUrl.replace(/^\/+/, ""));
}

const [javascript, css] = await Promise.all([
  readFile(assetPath(scriptMatch[1]), "utf8"),
  readFile(assetPath(styleMatch[1]), "utf8"),
]);

const standalone = html
  .replace(
    styleMatch[0],
    () => `<style>\n${css.replaceAll("</style", "<\\/style")}\n</style>`,
  )
  .replace(
    scriptMatch[0],
    () =>
      `<script type="module">\n${javascript.replaceAll("</script", "<\\/script")}\n</script>`,
  );

await writeFile(outputPath, standalone);
console.log(`Created ${path.basename(outputPath)}`);
