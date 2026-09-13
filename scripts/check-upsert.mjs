// 守門：欄位層級授權的表不准用 .upsert()。由 check.sh 呼叫。
//
// 為什麼是獨立檔案而不是內嵌在 check.sh：內嵌版本經過 bash 與 heredoc 兩層
// 跳脫之後變成語法錯誤，而那個錯誤訊息被當成「違規內容」報了出來 ——
// 守門壞掉跟找到違規長得一模一樣。獨立檔案沒有跳脫問題，也測得到。
//
// 背景：2026-09-02 咬過，而且咬的是所有人第一次進看板都會撞到的那道門
//（知情同意按下去完全沒反應）。PostgREST 的 upsert 會把 payload 的每一欄
// 都放進 ON CONFLICT DO UPDATE 的 SET 清單，包含主鍵；而 availability_meta
// 只發了 grant update (notice_seen_at)，於是整句被拒。
//
// **不是所有 upsert 都有問題**：護照對 stamps / entries 用 upsert 是對的，
// 那兩張表有表層級的 update 授權。對 visas 用 upsert 也是對的，但理由不一樣——
// 那張表完全沒有 update 授權（見 2026-08-26-visas.sql），issueVisas() 與
// restore() 靠的是 `{ ignoreDuplicates: true }`：PostgREST 遇到這個旗標會把
// upsert 展開成 `ON CONFLICT DO NOTHING`，沒有 SET 清單，本來就不需要 update
// 權限。真正有問題的是「有 insert 授權、卻在某句 upsert 裡沒有這個豁免」的表。
import fs from "node:fs";

export function columnGrantedTables(files) {
  const out = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8").replace(/--[^\n]*/g, "");
    for (const m of src.matchAll(/grant\s+update\s*\([^)]*\)\s+on\s+(?:table\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi))
      out.add(m[1].toLowerCase());
  }
  return out;
}

// ============================================================================
// 2026-09-12（控制端裁定）：第二種守備範圍
// ============================================================================
// columnGrantedTables() 只抓「grant update (欄位) on 表」這種欄位層級部分授權
// 的寫法。而 availability_week / availability_week_mark 這兩張新表**完全不發
// update 授權**（見 2026-09-20-availability-week.sql 檔頭：「改時間」是刪舊
// 插新，不是 update），所以上面那支守門根本看不到它們——這剛好漏掉風險更高的
// 那一類：對完全沒有 update 權限的表用 upsert，ON CONFLICT DO UPDATE 會因為
// 缺 update 權限讓整句被拒，症狀跟 2026-09-02 那次一模一樣（按了存檔沒反應）。
//
// 抓法：insert 授權的表，扣掉 update 授權的表（不管整表還是逐欄），剩下的
// 就是「能 insert、但整份遷移檔完全沒給過它 update」的表。這裡要看懂
// `grant a, b, c on t1, t2 to ...` 這種一次多權限多表的寫法，不是只有
// columnGrantedTables() 認得的那一種形狀。

// 權限清單用「括號外的逗號」切開——`select (a, b), update (c, d)` 這種
// 欄位清單裡的逗號不算切點，不然會被切成四段，其中兩段是半個欄位清單。
function splitPrivileges(list) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; }
    else cur += ch;
  }
  parts.push(cur);
  return parts;
}

export function tablesGrantedPrivilege(files, privilege) {
  const out = new Set();
  const re = /grant\s+([\s\S]*?)\s+on\s+((?:table\s+)?[a-z0-9_.,\s]+?)\s+to\b/gi;
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8").replace(/--[^\n]*/g, "");
    for (const m of src.matchAll(re)) {
      const hasPriv = splitPrivileges(m[1]).some(p => new RegExp("^\\s*" + privilege + "\\b", "i").test(p));
      if (!hasPriv) continue;
      for (const t of m[2].replace(/^\s*table\s+/i, "").split(",")) {
        const name = t.trim().replace(/^public\./i, "").toLowerCase();
        if (/^[a-z_][a-z0-9_]*$/.test(name)) out.add(name);
      }
    }
  }
  return out;
}

export function neverUpdateGrantedTables(files) {
  const inserted = tablesGrantedPrivilege(files, "insert");
  const updated = tablesGrantedPrivilege(files, "update");
  return new Set([...inserted].filter(t => !updated.has(t)));
}

// 在 from("表") 之後 window 個字元內出現 .upsert( 就算命中。
// 用字串掃描不用 RegExp，表名不必跳脫。
//
// ⚠ 這支不要改判斷邏輯（控制端 2026-09-12 裁定明講）：它只負責「有沒有命中」，
// 「命中了算不算危險」是下面 upsertGuardedEverywhere() 的事，兩層分開。
export function findUpserts(src, table, window = 220) {
  const needle = 'from("' + table + '")';
  let i = 0;
  while ((i = src.indexOf(needle, i)) !== -1) {
    if (src.slice(i, i + window).includes(".upsert(")) return true;
    i += needle.length;
  }
  return false;
}

// 命中之後才問的第二個問題：這句 upsert 有沒有帶 `{ ignoreDuplicates: true }`。
// 有的話展開成 ON CONFLICT DO NOTHING，不需要 update 權限，不算危險——
// 這是 visas 表既有、正確的用法（見檔頭那段說明）。反向驗證時發現，
// 把「完全沒有 update 授權」的表整批列進守備範圍會誤傷 visas，所以「命中」
// 跟「危險」要分兩層問，不能只看 findUpserts() 命中就報。
//
// tail 給 300 字元：目前這兩句 upsert 呼叫（.upsert(rows.map(...), { ... })）
// 展開後大約 140 字元，300 留了一倍以上的餘裕。這裡跟 findUpserts() 一樣用
// 字串掃描，不解析成 AST——找的是「同一句呼叫附近」，不是嚴謹的括號配對。
function upsertGuardedEverywhere(src, table, window = 220, tail = 300) {
  const needle = 'from("' + table + '")';
  let i = 0;
  while ((i = src.indexOf(needle, i)) !== -1) {
    const upsertAt = src.indexOf(".upsert(", i);
    if (upsertAt !== -1 && upsertAt - i <= window) {
      const afterCall = src.slice(upsertAt, upsertAt + tail);
      if (!afterCall.includes("ignoreDuplicates")) return false; // 這一句沒有豁免
    }
    i += needle.length;
  }
  return true; // 這張表在這個檔案裡，每一句 upsert 都有豁免（或根本沒有 upsert）
}

export function scan(sqlFiles, dirs) {
  // 兩種守備範圍取聯集：欄位層級部分授權的表（既有）＋完全沒有 update 授權、
  // 但有 insert 授權的表（2026-09-12 加）。
  const tables = new Set([...columnGrantedTables(sqlFiles), ...neverUpdateGrantedTables(sqlFiles)]);
  if (tables.size === 0) {
    return { broke: "找不到任何要守的表（欄位層級 update 授權，或完全沒有 update 授權的 insert 授權表）" };
  }
  const bad = [];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter(x => x.endsWith(".js"))) {
      const path = d + "/" + f;
      const src = fs.readFileSync(path, "utf8").replace(/\/\/[^\n]*/g, "");
      for (const t of tables)
        if (findUpserts(src, t) && !upsertGuardedEverywhere(src, t)) bad.push(path + ":" + t);
    }
  }
  return { tables: [...tables].sort(), bad };
}

if (import.meta.url === "file://" + process.argv[1]) {
  const sql = fs.readdirSync("supabase/migrations").map(f => "supabase/migrations/" + f)
    .concat(["supabase/schema.sql"]).filter(f => f.endsWith(".sql"));
  // 2026-09-11：加 settings/src（「我的故事」分 insert/update 兩條路，
  // id 沒有 UPDATE 權限，upsert 會整句被拒）跟 admin/src（遲早也會寫資料）。
  const r = scan(sql, ["availability/src", "app/src", "passport/src", "reset",
                       "settings/src", "admin/src"]);
  if (r.broke) { console.log("GUARD-BROKE " + r.broke); process.exit(0); }
  console.log(r.bad.length ? "BAD " + r.bad.join(" ") : "OK " + r.tables.join(","));
}
