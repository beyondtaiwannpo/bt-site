// 權限修正（2026-11-13，supabase/migrations/2026-12-19-access-fixes.sql）。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as PE from "../admin/people/src/ui.js";

F.setLang("zh"); PE.setLang("zh");
const EV = { id: "e1", slug: "camp", team: "Curriculum Team", workspace_id: "custom:event-camp", status: "draft", title_zh: "營隊", title_en: "Camp", form_id: "f1" };
const FORM = { id: "f1", status: "open" };
const ME = { id: "u2", role: "cadre", board: "member", ws: {} };

test("★ Senior Adviser 的邀請表單不列 Co-President 與 Senior Adviser；Co-President 照列", () => {
  assert.ok(!PE.inviteWhoFor(false).includes("cadre:president"));
  assert.ok(!PE.inviteWhoFor(false).includes("cadre:senior_adviser"));
  assert.ok(PE.inviteWhoFor(false).includes("cadre:director"));
  assert.deepEqual(PE.inviteWhoFor(true), PE.INVITE_WHO);
  const sa = PE.inviteFormNewHTML({}, [], false, [], false);
  assert.doesNotMatch(sa, /value="cadre:president"/);
  assert.match(PE.inviteFormNewHTML({}, [], false, [], true), /value="cadre:president"/);
});
test("沒被加進這一場的幹部：看得到活動內容（唯讀），報名名單與表單的連結不畫，告訴他找誰", () => {
  const h = F.eventEditHTML(EV, FORM, 3, ME, "", false, [], [], null, null);
  assert.doesNotMatch(h, /data-act="open-apps"|data-act="open-form"|data-act="open-checkin"/);
  assert.match(h, /找這個 team 的 Director/);
  assert.doesNotMatch(h, /data-autosave="ev-save"/);
  const on = F.eventEditHTML(EV, FORM, 3, { ...ME, ws: { "custom:event-camp": "view" } }, "", false, [], [], null, null);
  assert.match(on, /data-act="open-apps"/);
});
test("遷移檔：守門是 trigger（每一條寫進邀請碼的路都過）、SQL Editor 不擋、smoke 有跑", () => {
  const sql = readFileSync(new URL("../supabase/migrations/2026-12-19-access-fixes.sql", import.meta.url), "utf8");
  assert.match(sql, /before insert or update of rank on public\.invite_codes/);
  assert.match(sql, /auth\.uid\(\) is not null and not public\.is_president\(\)/);
  assert.match(readFileSync(new URL("../scripts/db/smoke.sh", import.meta.url), "utf8"), /2026-12-19-access-fixes\.sql/);
});
