import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("../public/", import.meta.url);
const port = Number(process.env.PORT || 4175);
const host = process.env.HOST || "127.0.0.1";

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  const requestPath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const fileUrl = new URL(safePath, root);

  try {
    const info = await stat(fileUrl);
    const target = info.isDirectory() ? new URL("index.html", fileUrl) : fileUrl;
    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": mime[extname(target.pathname)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Не найдено");
  }
});

server.listen(port, host, () => {
  console.log(`Local URL: http://${host}:${port}`);
});
