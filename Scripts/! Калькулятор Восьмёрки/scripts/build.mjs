import { cp, mkdir, rm } from "node:fs/promises";

const source = new URL("../public/", import.meta.url);
const output = new URL("../dist/", import.meta.url);
const outputMetadata = new URL(".openai/", output);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await mkdir(outputMetadata, { recursive: true });
await cp(
  new URL("../.openai/hosting.json", import.meta.url),
  new URL("hosting.json", outputMetadata),
);
await cp(
  new URL("../worker/static-worker.js", import.meta.url),
  new URL("_worker.js", output),
);

console.log("Static build complete: dist");
