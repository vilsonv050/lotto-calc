import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const source = new URL("../public/", import.meta.url);
const output = new URL("../dist/", import.meta.url);
const outputMetadata = new URL(".openai/", output);
const outputServer = new URL("server/", output);
const workerSource = new URL("../worker/static-worker.js", import.meta.url);
const portable = new URL("../Переносная версия/", import.meta.url);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await mkdir(outputMetadata, { recursive: true });
await mkdir(outputServer, { recursive: true });
await cp(
  new URL("../.openai/hosting.json", import.meta.url),
  new URL("hosting.json", outputMetadata),
);
await cp(workerSource, new URL("_worker.js", output));
await cp(workerSource, new URL("index.js", outputServer));

await rm(portable, { recursive: true, force: true });
await mkdir(portable, { recursive: true });
await cp(new URL("../public/assets/", import.meta.url), new URL("assets/", portable), {
  recursive: true,
});
await cp(new URL("../public/favicon.svg", import.meta.url), new URL("favicon.svg", portable));
await cp(new URL("../public/og-v3.png", import.meta.url), new URL("og-v3.png", portable));

const coreSource = await readFile(
  new URL("../public/lottery-core.js", import.meta.url),
  "utf8",
);
const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const portableScript = `${coreSource.replace(/^export\s+/gm, "")}\n${appSource.replace(
  /^import\s*\{[\s\S]*?\}\s*from\s*["']\.\/lottery-core\.js["'];\s*/,
  "",
)}`;
await writeFile(new URL("calculator.js", portable), portableScript, "utf8");

const portableStyles = await readFile(
  new URL("../public/styles.css", import.meta.url),
  "utf8",
);
await writeFile(new URL("styles.css", portable), portableStyles, "utf8");

const publicHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const portableHtml = publicHtml
  .replace(
    '<script type="module" src="./app.js"></script>',
    '<script defer src="./calculator.js"></script>',
  )
  .replaceAll('content="/og-v3.png"', 'content="./og-v3.png"');
await writeFile(new URL("index.html", portable), portableHtml, "utf8");

console.log("Static build complete: dist + Переносная версия");
