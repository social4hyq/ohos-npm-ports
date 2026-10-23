import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist");
const types = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const path = decodeURIComponent(url.pathname).replace(
      /^\/ohos-npm-ports\//,
      "/",
    );
    const file = resolve(
      root,
      `.${path.endsWith("/") ? `${path}index.html` : path}`,
    );
    if (!file.startsWith(`${root}${sep}`)) throw new Error("Outside root");
    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": types[extname(file)] || "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(4173, "0.0.0.0", () =>
  console.log("Preview: http://localhost:4173/ohos-npm-ports/"),
);
