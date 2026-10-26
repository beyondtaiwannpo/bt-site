// 信長什麼樣（2026-11-05）：版型的 JS 預覽版跟資料庫那一份同一個形狀。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as SITE from "../admin/site/src/ui.js";

SITE.setLang("zh");
const SQL = readFileSync("supabase/migrations/2026-11-05-email-layout.sql", "utf8");
const MARKERS = [
  'width="600"', 'max-width:600px', 'background:#EDE5D8', 'https://beyondtaiwannpo.com/shared/logo.png', '/photos/',
  "'Barlow Condensed'", "background:#FFC46C", "line-height:48px", "border-radius:999px", "class=\"bt-btn\"", "@media only screen and (max-width:620px)",
  "beyondtaiwan2020@gmail.com", "Beyond Taiwan · beyondtaiwannpo.com", "role=\"presentation\"",
];

test("★ 版型：table 排版、600 寬、紙色底、logo 絕對網址、每種信一張照片、一顆橘色按鈕 48 高、手機全寬、信尾；JS 與 SQL 同一套記號", () => {
  const h = SITE.mailHtml({ kind: "invite", lang: "zh", subject: "主旨", body: "第一段\n\n第二段", buttonUrl: "https://beyondtaiwannpo.com/app/?invite=x" });
  for (const m of MARKERS) { assert.ok(h.includes(m), "JS 少了 " + m); assert.ok(SQL.includes(m.replace(/'/g, "''")) || SQL.includes(m), "SQL 少了 " + m); }
  assert.match(h, /<img src="https:\/\/beyondtaiwannpo\.com\/photos\/group-photo\.jpg" width="600"/, "邀請信用團體照");
  assert.match(h, /<a class="bt-btn" href="https:\/\/beyondtaiwannpo\.com\/app\/\?invite=x"[^>]*>接受邀請<\/a>/);
  assert.match(h, /<p style="[^"]*">第一段<\/p><p style="[^"]*">第二段<\/p>/, "空行分段");
  assert.ok(h.length < 100000, "Gmail 102KB 會剪");
});

test("★ 使用者的字跳脫；只有網址那一行不印（按鈕就是它）；沒有網址就沒有按鈕；英文版用英文按鈕與信尾；家長那封信尾不一樣", () => {
  const h = SITE.mailHtml({ kind: "request_new", lang: "zh", subject: "<b>x</b>", body: "名字 <script>alert(1)</script>\n\nhttps://beyondtaiwannpo.com/admin/#requests/1", buttonUrl: "https://beyondtaiwannpo.com/admin/#requests/1" });
  assert.doesNotMatch(h, /<script>|<b>x/); assert.match(h, /&lt;script&gt;/); assert.match(h, /<title>&lt;b&gt;x&lt;\/b&gt;<\/title>/);
  assert.equal((h.match(/beyondtaiwannpo\.com\/admin\/#requests\/1/g) || []).length, 2, "網址只出現在按鈕與它底下的小字，不在段落裡");
  assert.doesNotMatch(SITE.mailHtml({ kind: "notice", lang: "zh", subject: "s", body: "b", buttonUrl: "" }), /<a class="bt-btn"/);
  const en = SITE.mailHtml({ kind: "meeting_invite", lang: "en", subject: "s", body: "b", buttonUrl: "https://x/y" });
  assert.match(en, /<html lang="en">/); assert.match(en, />Reply<\/a>/); assert.match(en, /Please do not reply to this email/);
  assert.match(SITE.mailHtml({ kind: "guardian", lang: "zh", subject: "s", body: "b", buttonUrl: "" }), /這封信是告知，不需要回覆或簽名/);
  assert.equal(SITE.mailButtonLabel("invite", "zh", "  現在加入 "), "現在加入", "後台改了按鈕的字就用那個字");
  assert.equal(SITE.mailButtonLabel("accepted", "en"), "Open Beyond Taiwan");
});

test("★ 遷移檔：send_pending_mail 送 html 加 text、按鈕從 outbox 那一列推、語言照收信的人、one_lang 開關、模板多四欄、七參數的 set_mail_template", () => {
  assert.match(SQL, /'subject', v_sub, 'text', v_txt, 'html', v_html/);
  assert.match(SQL, /create or replace function public\.mail_button_url\(r public\.mail_outbox\)/);
  assert.match(SQL, /when r\.kind = 'invite' and r\.invite_code is not null then 'https:\/\/beyondtaiwannpo\.com\/app\/\?invite=' \|\| r\.invite_code/);
  assert.match(SQL, /insert into public\.mail_settings \(key, value\) values \('one_lang', 'true'\)/);
  assert.match(SQL, /alter table public\.profiles add column if not exists lang text/);
  for (const c of ["subject_en", "body_en", "button_label", "button_label_en"]) assert.match(SQL, new RegExp(`add column if not exists ${c} text`));
  assert.match(SQL, /set_mail_template\(p_kind text, p_subject text, p_body text, p_subject_en text, p_body_en text, p_button_label text, p_button_label_en text\)/);
  const d = readFileSync("admin/site/src/data.js", "utf8");
  assert.match(d, /p_subject_en: t\.subject_en \|\| null, p_body_en: t\.body_en \|\| null,\s*p_button_label: t\.button_label \|\| null, p_button_label_en: t\.button_label_en \|\| null/);
  assert.match(d, /select\("kind, subject:subject_zh, body:body_zh, subject_en, body_en, button_label, button_label_en, updated_at"\)/);
});

test("信件文案頁：中英兩份、按鈕的字、預覽是包好的 iframe、語言與寬度可以切", () => {
  const h = SITE.mailEditHTML("invite", { kind: "invite", subject: "主旨", body: "內文 {link}", subject_en: "Subject", body_en: "Body {link}", button_label: "", button_label_en: "" }, "", false, { lang: "en", w: 375 });
  for (const id of ["msub", "mbody", "mbtn", "msub-en", "mbody-en", "mbtn-en"]) assert.match(h, new RegExp(`id="${id}"`));
  assert.match(h, /<iframe class="mailframe"[^>]*style="width:375px" srcdoc="/);
  assert.match(h, /class="chip on" data-act="mail-prev-lang" data-v="en"/); assert.match(h, /class="chip on" data-act="mail-prev-w" data-v="375"/);
  assert.match(h, /&lt;h1 [\s\S]*?&gt;Subject&lt;\/h1&gt;/, "英文預覽用英文主旨");
  assert.match(h, /placeholder="Accept invitation"/, "按鈕空著就顯示預設當提示");
});
