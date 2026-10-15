// 端對端測試用的靜態檔伺服器（port 8765）。
//
// 2026-10-18 之前這支還兼一個假的登入層與 PostgREST 代理。Paul 的 Mac 裝了 Docker 之後，
// 改成打**真的本機 Supabase**（supabase start，API 在 54321），所以這支只剩兩件事：
//   1. 把這個 repo 的檔案原樣端出去
//   2. 只有 shared/supabase-config.js 換成指向本機 Supabase（網址與本機的 anon key）
// 前端一行都不用改，登入、確認信、限流、RLS 全部是 Supabase 真的那一層在跑。
//
// 用法：node scripts/e2e/server.mjs   （通常由 intern.mjs 自己起）
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, extname } from "node:path";

const PORT = Number(process.env.E2E_PORT || 8765);
const ROOT = process.cwd();
const PATH = `${process.env.HOME}/.orbstack/bin:/opt/homebrew/bin:${process.env.PATH}`;

// 本機 Supabase 的網址與金鑰：問 CLI，不寫死（金鑰是 CLI 產的，每台機器一樣但不該進 repo）。
export function localSupabase() {
  const j = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", env: { ...process.env, PATH } }));
  return { url: j.API_URL, anon: j.ANON_KEY, mail: j.MAILPIT_URL || j.INBUCKET_URL, studio: j.STUDIO_URL };
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
               ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
               ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };

export async function start() {
  const sb = localSupabase();
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith("/")) p += "index.html";
    if (p === "/shared/supabase-config.js") {
      res.writeHead(200, { "content-type": MIME[".js"], "cache-control": "no-store" });
      return res.end(`export const SUPABASE_URL = "${sb.url}";\nexport const SUPABASE_PUBLISHABLE_KEY = "${sb.anon}";\n`);
    }
    const f = join(ROOT, p);
    if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(f));
  });
  await new Promise(r => srv.listen(PORT, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${PORT}`, sb, stop() { srv.close(); } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await start();
  console.log("網站在", s.url, "，打的是本機 Supabase", s.sb.url, "（Ctrl-C 停）");
}
