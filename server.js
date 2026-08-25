import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleCompare, handleHrXlsx } from "./src/http-handlers.js";

const PORT = Number(process.env.PORT) || 3000;
const publicDir = join(fileURLToPath(new URL(".", import.meta.url)), "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let relative = decodeURIComponent(url.pathname);
  if (relative === "/") relative = "/index.html";
  const resolved = normalize(join(publicDir, relative));
  if (!resolved.startsWith(publicDir)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await readFile(resolved);
    res.writeHead(200, { "Content-Type": MIME[extname(resolved)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url?.startsWith("/api/compare")) {
    handleCompare(req, res);
    return;
  }
  if (req.method === "POST" && req.url?.startsWith("/api/hr.xlsx")) {
    handleHrXlsx(req, res);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405).end("Method not allowed");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Time compare on http://127.0.0.1:${PORT}`);
});
