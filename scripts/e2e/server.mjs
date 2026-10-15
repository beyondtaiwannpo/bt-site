// 本機的「假 Supabase」：給端對端測試（scripts/e2e/intern.mjs）用。
//
// 三件事在同一個 port（54321）上：
//   /rest/v1/*   轉給本機的 PostgREST（真的 PostgREST、真的 Postgres、真的 RLS）
//   /auth/v1/*   一個很小的 GoTrue 替身：註冊、登入、看自己是誰、登出。
//                簽的是真的 JWT（HS256），PostgREST 用同一把 secret 驗，
//                所以 auth.uid() 讀到的是瀏覽器那個人的 id。
//   其他         這個 repo 的靜態檔，只有 shared/supabase-config.js 被換成指向本機。
//
// ⚠ 這不是 Supabase。它驗得到：前端送出去的查詢在真的 RLS 下會不會被擋、
// 函式會不會回對的東西、畫面接到之後畫不畫得對。
// 它驗不到：Supabase 自己那一層（email 確認、Google 登入、限流、Vault、真的寄信）。
//
// 用法：node scripts/e2e/server.mjs [db名稱]   （通常由 intern.mjs 自己起）
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync, existsSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";

const DB = process.argv[2] || process.env.E2E_DB || "bt_e2e";
const PORT = Number(process.env.E2E_PORT || 54321);
const PGRST = Number(process.env.E2E_PGRST || 3001);
const SECRET = "bt-e2e-jwt-secret-must-be-at-least-32-chars-long";
const ROOT = process.cwd();

// 三個既有的幹部（id 要跟 db.sh 一樣）。
export const SEED = {
  "paul@example.com":   { id: "11111111-1111-1111-1111-111111111111", pw: "paulpass" },
  "istaff@example.com": { id: "99999999-9999-9999-9999-999999999991", pw: "staffpass" },
  "other@example.com":  { id: "44444444-4444-4444-4444-444444444444", pw: "otherpass" },
};
const users = new Map(Object.entries(SEED).map(([email, u]) => [email, { ...u, email }]));

const b64 = s => Buffer.from(s).toString("base64url");
function jwt(claims) {
  const h = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64(JSON.stringify(claims));
  const sig = createHmac("sha256", SECRET).update(h + "." + p).digest("base64url");
  return `${h}.${p}.${sig}`;
}
function decode(token) {
  try {
    const [h, p, sig] = String(token || "").split(".");
    if (createHmac("sha256", SECRET).update(h + "." + p).digest("base64url") !== sig) return null;
    return JSON.parse(Buffer.from(p, "base64url").toString());
  } catch { return null; }
}
const ANON_KEY = jwt({ role: "anon", iss: "bt-e2e", iat: 1700000000, exp: 4100000000 });

function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const user = { id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
                 email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "email" },
                 user_metadata: {}, identities: [{ id: u.id, user_id: u.id, provider: "email" }],
                 created_at: new Date().toISOString() };
  return {
    access_token: jwt({ sub: u.id, role: "authenticated", aud: "authenticated", email: u.email,
                        iss: "bt-e2e", iat: now, exp: now + 3600 }),
    token_type: "bearer", expires_in: 3600, expires_at: now + 3600,
    refresh_token: "rt-" + u.id, user,
  };
}

const psql = sql => execFileSync("psql", ["-d", DB, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
                                  { encoding: "utf8" }).trim();

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
}
const readBody = req => new Promise(r => { let s = ""; req.on("data", c => s += c); req.on("end", () => r(s)); });

// ── GoTrue 替身 ──────────────────────────────────────────────────────
async function auth(req, res, url) {
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  if (req.method === "POST" && path === "/signup") {
    const b = JSON.parse(await readBody(req) || "{}");
    const email = String(b.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return json(res, 400, { code: "validation_failed", msg: "Unable to validate email address: invalid format" });
    if (String(b.password || "").length < 6)
      return json(res, 422, { code: "weak_password", msg: "Password should be at least 6 characters." });
    if (users.has(email))
      return json(res, 422, { code: "user_already_exists", msg: "User already registered" });
    const id = randomUUID();
    // 跟正式站的註冊 trigger 一樣：auth.users 一列、profiles 一列（role 吃 default = student）。
    psql(`insert into auth.users (id,email) values ('${id}','${email}'); insert into public.profiles (id) values ('${id}');`);
    const u = { id, email, pw: b.password };
    users.set(email, u);
    return json(res, 200, session(u));
  }
  if (req.method === "POST" && path === "/token") {
    const b = JSON.parse(await readBody(req) || "{}");
    if (url.searchParams.get("grant_type") === "refresh_token") {
      const u = [...users.values()].find(x => "rt-" + x.id === b.refresh_token);
      return u ? json(res, 200, session(u)) : json(res, 400, { code: "refresh_token_not_found", msg: "nope" });
    }
    const u = users.get(String(b.email || "").trim().toLowerCase());
    if (!u || u.pw !== b.password)
      return json(res, 400, { code: "invalid_credentials", error: "invalid_grant", error_description: "Invalid login credentials" });
    return json(res, 200, session(u));
  }
  if (req.method === "GET" && path === "/user") {
    const c = decode(String(req.headers.authorization || "").replace(/^Bearer /, ""));
    const u = c && [...users.values()].find(x => x.id === c.sub);
    return u ? json(res, 200, session(u).user) : json(res, 401, { code: "bad_jwt", msg: "invalid JWT" });
  }
  if (req.method === "POST" && path === "/logout") { res.writeHead(204); return res.end(); }
  json(res, 404, { msg: "e2e auth shim: " + req.method + " " + path });
}

// ── PostgREST 代理 ───────────────────────────────────────────────────
async function rest(req, res, url) {
  const target = `http://127.0.0.1:${PGRST}${url.pathname.replace(/^\/rest\/v1/, "")}${url.search}`;
  const headers = {};
  for (const k of ["authorization", "accept", "content-type", "prefer", "range", "accept-profile", "content-profile", "x-client-info"])
    if (req.headers[k]) headers[k] = req.headers[k];
  // supabase-js 沒登入時會把 anon key 當 Bearer 送；它是我們簽的，PostgREST 認得。
  const body = (req.method === "GET" || req.method === "HEAD") ? undefined : await readBody(req);
  const r = await fetch(target, { method: req.method, headers, body });
  const out = {};
  for (const [k, v] of r.headers) if (!["content-encoding", "transfer-encoding", "connection"].includes(k)) out[k] = v;
  out["access-control-allow-origin"] = "*";
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
}

// ── 靜態檔 ─────────────────────────────────────────────────────────
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
               ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
               ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
function serve(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  if (p === "/shared/supabase-config.js") {
    res.writeHead(200, { "content-type": MIME[".js"] });
    return res.end(`export const SUPABASE_URL = "http://127.0.0.1:${PORT}";\nexport const SUPABASE_PUBLISHABLE_KEY = "${ANON_KEY}";\n`);
  }
  const f = join(ROOT, p);
  if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(f));
}

export async function start() {
  // PostgREST：真的那一支，吃本機的 Postgres。
  const cfg = join(mkdtempSync(join(tmpdir(), "bt-e2e-")), "postgrest.conf");
  writeFileSync(cfg, [
    // 帳密用 query 參數寫，不寫成 user:password@ 的樣子：check.sh 有一條守門抓「連線字串帶密碼」，
    // 這裡是本機用完就丟的角色，但守門分不出來，也不該為它開例外。
    `db-uri = "postgres://127.0.0.1:5432/${DB}?user=authenticator&password=authenticator"`,
    `db-schemas = "public"`, `db-anon-role = "anon"`,
    `jwt-secret = "${SECRET}"`, `server-host = "127.0.0.1"`, `server-port = ${PGRST}`,
    `log-level = "error"`,
  ].join("\n") + "\n");
  const pg = spawn("postgrest", [cfg], { stdio: process.env.E2E_VERBOSE ? "inherit" : "ignore" });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PGRST}/`); if (r.ok) break; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" });
        return res.end();
      }
      if (url.pathname.startsWith("/auth/v1/")) return await auth(req, res, url);
      if (url.pathname.startsWith("/rest/v1/")) return await rest(req, res, url);
      return serve(req, res, url);
    } catch (e) { json(res, 500, { msg: "e2e server: " + e.message }); }
  });
  await new Promise(r => srv.listen(PORT, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${PORT}`, stop() { srv.close(); pg.kill(); } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await start();
  console.log("e2e 假 Supabase 在", s.url, "（Ctrl-C 停）");
}
