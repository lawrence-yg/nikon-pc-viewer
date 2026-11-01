// 本地自测用静态服务器：node serve.cjs 后打开 http://127.0.0.1:8791
// / 直接给构建产物；样本文件可以按路径取，方便在页面里试拖。
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const ART = path.join(ROOT, "尼康优化校准查看器.html");
const PORT = process.env.PORT || 8791;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".ncp": "application/octet-stream",
  ".np3": "application/octet-stream",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

http
  .createServer((q, s) => {
    const url = decodeURIComponent(q.url.split("?")[0]);
    let p = url === "/" || url === "/index.html"
      ? ART
      : path.resolve(ROOT, "." + url);

    // 只允许项目目录内的文件，别让这个调试服务器变成任意文件读取器
    if (p !== ART && !p.startsWith(ROOT + path.sep)) {
      s.writeHead(403);
      return s.end("forbidden");
    }
    fs.readFile(p, (e, d) => {
      if (e) {
        s.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return s.end("not found: " + url + "\n（首页需要先用 node build.mjs 生成产物）");
      }
      s.writeHead(200, { "Content-Type": TYPES[path.extname(p).toLowerCase()] || "application/octet-stream" });
      s.end(d);
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`listening on http://127.0.0.1:${PORT}  (首页 = 构建产物)`);
  });
