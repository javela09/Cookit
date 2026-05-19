const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number.parseInt(process.env.PORT || "8888", 10);

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  };
  return types[ext] || "application/octet-stream";
}

function injectLocalApi(html) {
  if (html.includes('src="local-api.js"')) return html;

  return html.replace(
    '<script src="js/app.js"></script>',
    '<script src="local-api.js"></script>\n  <script src="js/app.js"></script>'
  );
}

function serveStatic(res, url) {
  const rawPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const decodedPath = decodeURIComponent(rawPath);
  const filePath = path.normalize(path.join(ROOT, decodedPath));

  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const isHtml = path.extname(filePath).toLowerCase() === ".html";
    const body = isHtml ? injectLocalApi(content.toString("utf8")) : content;
    res.writeHead(200, { "content-type": contentTypeFor(filePath) });
    res.end(body);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

  if (url.pathname === "/api/ping") {
    sendJson(res, 200, { ok: true, mode: "local-storage" });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(res, 404, {
      error: "La version local usa local-api.js y localStorage en el navegador."
    });
    return;
  }

  serveStatic(res, url);
});

server.listen(PORT, () => {
  console.log(`Cookit local: http://localhost:${PORT}`);
});
