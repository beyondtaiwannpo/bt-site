// 財務（2026-11-08，/admin/finance/）：總覽的算法、CSV、篩選、金額格式、側欄、手畫的 SVG 長條圖。
// 全部是純函式，不碰資料庫。資料庫那一半在 scripts/db/smoke.sh 的「財務」一段。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as FIN from "../admin/finance/src/ui.js";
import * as F from "../admin/src/ui.js";
import * as SITE from "../admin/site/src/ui.js";
import * as PA from "../admin/passports/src/ui.js";
import * as PE from "../admin/people/src/ui.js";
import { says } from "../admin/finance/src/data.js";

for (const M of [FIN, F, SITE, PA, PE]) M.setLang("zh");

// ── 假資料：三個帳戶、四個類別、八筆、兩筆預算。數字刻意湊成一眼算得出來。 ──
const TERM = { id: "2026-27", starts_on: "2026-08-01", ends_on: "2027-07-31", status: "current" };
const PREV = { id: "2025-26", starts_on: "2025-08-01", ends_on: "2026-07-31", status: "ended" };
const ACC = [
  { id: "a1", name_zh: "玉山活存", name_en: "E.Sun checking", kind: "bank", currency: "TWD", opening_balance: 100000, opening_on: "2026-11-08", sort: 10, archived_at: null },
  { id: "a2", name_zh: "現金", name_en: "Cash box", kind: "cash", currency: "TWD", opening_balance: 5000, opening_on: "2026-11-08", sort: 20, archived_at: null },
  { id: "a3", name_zh: "嘖嘖", name_en: "zeczec", kind: "platform", currency: "TWD", opening_balance: 0, opening_on: "2026-11-08", sort: 30, archived_at: null },
];
const CAT = [
  { id: "c1", kind: "income", name_zh: "贊助", name_en: "Sponsorship", sort: 10, archived_at: null },
  { id: "c2", kind: "income", name_zh: "募資", name_en: "Crowdfunding", sort: 30, archived_at: null },
  { id: "c3", kind: "expense", name_zh: "場地", name_en: "Venue", sort: 10, archived_at: null },
  { id: "c4", kind: "expense", name_zh: "餐飲", name_en: "Food", sort: 20, archived_at: null },
];
const tx = (id, happened_on, kind, amount, account_id, extra) => Object.assign(
  { id, happened_on, kind, amount, currency: "TWD", amount_twd: amount, fx_rate: null, account_id, to_account_id: null, category_id: null,
    counterparty: "", note: "", receipt_path: null, term_id: "2026-27", voided_at: null, void_reason: null }, extra || {});
const TX = [
  tx("t1", "2026-11-10", "income", 30000, "a1", { category_id: "c1", counterparty: "台積電慈善基金會" }),
  tx("t2", "2026-11-12", "expense", 8000, "a1", { category_id: "c3", counterparty: "松菸" }),
  tx("t3", "2026-11-15", "transfer", 2000, "a1", { to_account_id: "a2" }),
  tx("t4", "2026-11-20", "expense", 500, "a2", { category_id: "c4", note: "便當\n十個" }),
  tx("t5", "2026-12-01", "income", 100, "a1", { currency: "USD", fx_rate: 32, amount_twd: 3200, category_id: "c1", counterparty: 'He said "hi", ok' }),
  tx("t6", "2026-11-25", "expense", 999, "a1", { category_id: "c3", voided_at: "2026-11-26T00:00:00Z", void_reason: "重複登了" }),
  // 開帳日（11-08）之前的兩筆：算進那一屆的收入，**不算進餘額**（餘額是從開帳那天的數字起算，之前的錢已經在裡面）。
  tx("t7", "2026-10-05", "income", 1000, "a1", { category_id: "c1" }),
  tx("t8", "2025-09-01", "income", 777, "a1", { category_id: "c1", term_id: "2025-26" }),
];
const BUD = [{ term_id: "2026-27", category_id: "c3", amount_twd: 20000 }, { term_id: "2026-27", category_id: "c4", amount_twd: 1000 }];
const FIX = { accounts: ACC, categories: CAT, transactions: TX, budgets: BUD, terms: [TERM, PREV], term: TERM, today: "2026-11-28" };

test("★ 側欄：五個資料夾都有「財務」這一組，看得到的只有 can_view_finance 的人（my_access 的 finance 那一格）", () => {
  for (const [label, M] of [["admin", F], ["site", SITE], ["passports", PA], ["people", PE], ["finance", FIN]]) {
    const g = M.GROUPS.find(x => x.key === "finance");
    assert.ok(g, `${label} 的 GROUPS 沒有 finance`);
    assert.equal(g.href, "/admin/finance/"); assert.equal(g.who, "ws:finance");
    assert.deepEqual(M.ITEMS.filter(i => i.group === "finance").map(i => i.key), ["overview", "tx", "accounts", "budget", "export"], label);
    for (const i of M.ITEMS.filter(x => x.group === "finance")) assert.equal(i.who, "ws:finance", `${label} ${i.key}`);
    const assoc = { role: "cadre", board: "member", team: "Sponsorship Team", ws: {} };
    assert.equal(M.canEnter(g, assoc), false, `${label}：沒有 finance 那一格的 Associate 進不去`);
    assert.equal(M.canEnter(g, { ...assoc, ws: { finance: "view" } }), true, `${label}：Sponsorship 的 Director 進得去`);
    assert.equal(M.canEnter(g, { role: "cadre", board: "senior_adviser", team: "", ws: {} }), true, `${label}：Senior Adviser 進得去`);
    assert.equal(M.canEnter(g, { role: "cadre", board: "president", team: "", ws: {} }), true, label);
    assert.equal(M.canEnter(g, { role: "student", board: "president", ws: { finance: "edit" } }), false, `${label}：學員就算有那一格也不行`);
    const rail = M.railHTML("forms", "home", { ...assoc, name: "小安" });
    assert.match(rail, /class="rail-group off"[^>]*>財務<\/div>/, `${label}：看不到的人整組淡掉`);
    assert.doesNotMatch(rail, /href="\/admin\/finance\/"/, label);
    const railOk = M.railHTML("forms", "home", { ...assoc, name: "小安", ws: { finance: "edit" } });
    assert.match(railOk, /href="\/admin\/finance\/\?lang=zh#overview">總覽/, `${label}：看得到的人五行都是連結`);
    assert.match(railOk, /href="\/admin\/finance\/\?lang=zh#export">匯出/, label);
    // 總覽的「你的存取」那一塊會印 finance 那一格：名字是「財務」、連去 /admin/finance/
    assert.equal(M.wsCellLabel({ id: "finance" }), "財務（帳戶、收支、預算）", label);
    assert.equal(M.wsCellHref({ id: "finance" }), "/admin/finance/#overview", label);
  }
});

test("誰改得動：Co-President 與 finance=edit 的人；Senior Adviser 與 finance=view 只看", () => {
  assert.equal(FIN.finLevel({ role: "cadre", board: "president", ws: {} }), "edit");
  assert.equal(FIN.finLevel({ role: "cadre", board: "senior_adviser", ws: {} }), "view");
  assert.equal(FIN.finLevel({ role: "cadre", board: "senior_adviser", ws: { finance: "edit" } }), "edit", "Senior Adviser 兼 Sponsorship Director 就能改");
  assert.equal(FIN.finLevel({ role: "cadre", board: "director", ws: { finance: "edit" } }), "edit");
  assert.equal(FIN.finLevel({ role: "cadre", board: "director", ws: { finance: "view" } }), "view");
  assert.equal(FIN.finLevel({ role: "cadre", board: "member", ws: {} }), "");
  assert.equal(FIN.finLevel({ role: "student", board: "president", ws: { finance: "edit" } }), "");
  assert.equal(FIN.canEditFin({ role: "cadre", board: "president", ws: {} }), true);
  assert.equal(FIN.canEditFin({ role: "cadre", board: "senior_adviser", ws: {} }), false);
});

test("★ 金額：千分位、NT$ 在前、有角分才印小數、負數、美金", () => {
  assert.equal(FIN.fmtMoney(1234567), "NT$1,234,567");
  assert.equal(FIN.fmtMoney(0), "NT$0");
  assert.equal(FIN.fmtMoney(12.5), "NT$12.50");
  assert.equal(FIN.fmtMoney(-500), "-NT$500");
  assert.equal(FIN.fmtMoney("3200.00"), "NT$3,200", "資料庫回的 numeric 是字串");
  assert.equal(FIN.fmtMoney(100, "USD"), "US$100");
  assert.equal(FIN.fmtMoney(99.9, "JPY"), "JPY 99.90");
  assert.equal(FIN.fmtMoney(null), "NT$0");
});

test("★ 美金那一列：存的是台幣（金額 × 匯率，四捨五入到分）；台幣不用匯率；沒匯率就不算", () => {
  assert.equal(FIN.toTwd(100, "USD", 32), 3200);
  assert.equal(FIN.toTwd(33.333, "USD", 31.1), 1036.66);
  assert.equal(FIN.toTwd(500, "TWD", null), 500);
  assert.equal(FIN.toTwd(500, "TWD", 99), 500, "台幣的匯率一律不用");
  assert.equal(FIN.toTwd(100, "USD", null), null);
  assert.equal(FIN.toTwd(100, "USD", 0), null);
});

test("哪一屆：日期落在哪一屆就是哪一屆，都不在就是 current；年月字串", () => {
  assert.equal(FIN.termOf("2026-11-10", [TERM, PREV]), "2026-27");
  assert.equal(FIN.termOf("2025-09-01", [TERM, PREV]), "2025-26");
  assert.equal(FIN.termOf("2019-01-01", [TERM, PREV]), "2026-27");
  assert.equal(FIN.ym("2026-11-10"), "2026-11");
  assert.deepEqual(FIN.monthsBetween("2026-08-01", "2026-11-28"), ["2026-08", "2026-09", "2026-10", "2026-11"]);
});

test("★ 總覽的算法：餘額 = 開帳 + 收入 − 支出 ± 轉帳，作廢的不算、開帳日之前的不算進餘額、轉帳不是收入也不是支出", () => {
  const o = FIN.overview(FIX);
  assert.deepEqual(o.balances.map(b => [b.account.id, b.balance]), [["a1", 123200], ["a2", 6500], ["a3", 0]], "100000 + 30000 − 8000 − 2000（轉出）+ 3200；10-05 與去年那兩筆在開帳日之前，不算");
  assert.equal(o.total, 129700);
  assert.equal(o.termIncome, 34200, "這一屆的收入：30000 + 3200（美金換算）+ 1000；上一屆那 777 不算、作廢的不算");
  assert.equal(o.termExpense, 8500, "8000 + 500；作廢那 999 不算；轉帳 2000 不算");
  assert.equal(o.monthIncome, 30000); assert.equal(o.monthExpense, 8500);
  assert.deepEqual(o.byCategory.expense.map(x => [x.category.id, x.amount]), [["c3", 8000], ["c4", 500]]);
  assert.deepEqual(o.byCategory.income.map(x => [x.category.id, x.amount]), [["c1", 34200], ["c2", 0]], "沒用到的類別也列，金額 0，排在後面");
  assert.deepEqual(o.months, [
    { ym: "2026-08", income: 0, expense: 0 }, { ym: "2026-09", income: 0, expense: 0 }, { ym: "2026-10", income: 1000, expense: 0 },
    { ym: "2026-11", income: 30000, expense: 8500 }, { ym: "2026-12", income: 3200, expense: 0 },
  ], "從這一屆開始的那個月到今天或最後一筆的那個月，沒有東西的月也要有一格");
  assert.deepEqual(o.budget.map(b => [b.category.id, b.budget, b.spent]), [["c3", 20000, 8000], ["c4", 1000, 500]]);
  assert.equal(o.uncategorised, 0);
});

test("總覽：看上一屆就是上一屆的數字；餘額永遠是現在的（不看屆）；沒有帳戶也不會炸", () => {
  const o = FIN.overview({ ...FIX, term: PREV });
  assert.equal(o.termIncome, 777); assert.equal(o.termExpense, 0);
  assert.equal(o.total, 129700);
  assert.equal(o.months.length, 12, "已經結束的屆印整年");
  const e = FIN.overview({ accounts: [], categories: [], transactions: [], budgets: [], terms: [], term: null, today: "2026-11-28" });
  assert.equal(e.total, 0); assert.deepEqual(e.balances, []); assert.deepEqual(e.months, []);
});

test("★ 篩選：屆、月、種類、帳戶、類別、文字；轉帳看兩邊帳戶；文字找對象與備註；作廢的照樣列（畫面上變灰）", () => {
  const all = FIN.filterTx(TX, {});
  assert.equal(all.length, 8);
  assert.deepEqual(FIN.filterTx(TX, { term: "2025-26" }).map(t => t.id), ["t8"]);
  assert.deepEqual(FIN.filterTx(TX, { month: "2026-11" }).map(t => t.id).sort(), ["t1", "t2", "t3", "t4", "t6"]);
  assert.deepEqual(FIN.filterTx(TX, { kind: "transfer" }).map(t => t.id), ["t3"]);
  assert.deepEqual(FIN.filterTx(TX, { account: "a2" }).map(t => t.id).sort(), ["t3", "t4"], "轉入那一邊也算那個帳戶的");
  assert.deepEqual(FIN.filterTx(TX, { category: "c3" }).map(t => t.id).sort(), ["t2", "t6"]);
  assert.deepEqual(FIN.filterTx(TX, { q: "松菸" }).map(t => t.id), ["t2"]);
  assert.deepEqual(FIN.filterTx(TX, { q: "便當" }).map(t => t.id), ["t4"]);
  assert.deepEqual(FIN.filterTx(TX, { q: "HI" }).map(t => t.id), ["t5"], "不分大小寫");
  assert.deepEqual(FIN.filterTx(TX, { term: "2026-27", kind: "income", account: "a1", q: "台積" }).map(t => t.id), ["t1"]);
  assert.deepEqual(FIN.sortTx(TX).map(t => t.id), ["t5", "t6", "t4", "t3", "t2", "t1", "t7", "t8"], "新的在前");
});

test("★ CSV：UTF-8 BOM 開頭（Excel 才認得中文）、逗號與引號與換行都包起來、引號加倍、作廢列寫原因、美金那列有匯率", () => {
  const s = FIN.csvOf(FIN.sortTx(TX), { accounts: ACC, categories: CAT });
  assert.equal(s.charCodeAt(0), 0xFEFF);
  const lines = s.slice(1).split("\r\n");
  assert.equal(lines[0], "日期,種類,金額,幣別,匯率,台幣,帳戶,轉入帳戶,類別,對象,備註,收據,作廢,作廢原因");
  assert.equal(lines.length, 10, "表頭、八列、最後一個空字串（結尾也有換行）");
  assert.equal(lines[lines.length - 1], "");
  assert.match(s, /2026-12-01,收入,100,USD,32,3200,玉山活存,,贊助,"He said ""hi"", ok",,,,/);
  assert.match(s, /2026-11-20,支出,500,TWD,,500,現金,,餐飲,,"便當\n十個",,,/);
  assert.match(s, /2026-11-25,支出,999,TWD,,999,玉山活存,,場地,,,,作廢,重複登了/);
  assert.match(s, /2026-11-15,轉帳,2000,TWD,,2000,玉山活存,現金,,,,,,/);
  assert.equal(FIN.csvCell("plain"), "plain");
  assert.equal(FIN.csvCell("a,b"), '"a,b"');
  assert.equal(FIN.csvCell('say "x"'), '"say ""x"""');
  assert.equal(FIN.csvCell(null), "");
  assert.equal(FIN.csvCell(12.5), "12.5");
  assert.equal(FIN.csvFilename({ term: "2026-27", month: "" }), "bt-finance-2026-27.csv");
  assert.equal(FIN.csvFilename({ term: "2026-27", month: "2026-11" }), "bt-finance-2026-11.csv");
  FIN.setLang("en");
  assert.match(FIN.csvOf([TX[0]], { accounts: ACC, categories: CAT }), /^﻿Date,Kind,Amount,Currency,Rate,TWD,Account,To account,Category,Counterparty,Note,Receipt,Voided,Void reason\r\n2026-11-10,Income,30000,TWD,,30000,E.Sun checking,,Sponsorship,/);
  FIN.setLang("zh");
});

test("★ 月份長條圖是自己畫的 SVG：每個月兩根（收入、支出）、最高的那根頂到頂、有 role=img 與說明、沒有數字就不畫圖", () => {
  const o = FIN.overview(FIX);
  const svg = FIN.monthsChartSVG(o.months);
  assert.match(svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"[^>]*role="img"/);
  assert.match(svg, /aria-label="每月收入與支出"/);
  const rects = [...svg.matchAll(/<rect class="(in|out)"[^>]*height="([\d.]+)"/g)];
  assert.equal(rects.length, 10, "五個月各兩根");
  const h = Object.fromEntries(rects.map((m, i) => [`${o.months[Math.floor(i / 2)].ym}:${m[1]}`, Number(m[2])]));
  assert.equal(h["2026-11:in"], FIN.CHART_H, "30000 是最大的，頂到頂");
  assert.ok(Math.abs(h["2026-11:out"] - FIN.CHART_H * 8500 / 30000) < 0.01);
  assert.equal(h["2026-08:in"], 0);
  assert.match(svg, /<text[^>]*>11月<\/text>/, "橫軸印月份");
  assert.match(svg, /<title>2026-11：收入 NT\$30,000、支出 NT\$8,500<\/title>/, "每個月一個 title，滑過去看得到數字");
  assert.doesNotMatch(svg, /<script|http/);
  assert.match(FIN.monthsChartSVG([{ ym: "2026-08", income: 0, expense: 0 }]), /class="empty sm"/);
  assert.match(FIN.monthsChartSVG([]), /class="empty sm"/);
});

test("類別長條：最大的那一條滿、其他照比例、預算條超過就橘的", () => {
  const h = FIN.catBarsHTML([{ category: CAT[2], amount: 8000 }, { category: CAT[3], amount: 500 }, { category: CAT[0], amount: 0 }]);
  assert.match(h, /<div class="fbar"[^>]*><span class="fbar-l">場地<\/span><span class="fbar-t"><i style="width:100%"><\/i><\/span><span class="fbar-n">NT\$8,000<\/span>/);
  assert.match(h, /餐飲.*width:6\.25%/);
  assert.match(h, /贊助.*width:0%/);
  const b = FIN.budgetBarsHTML([{ category: CAT[2], budget: 20000, spent: 8000 }, { category: CAT[3], budget: 1000, spent: 1200 }, { category: CAT[0], budget: 0, spent: 5 }]);
  assert.match(b, /場地.*width:40%.*NT\$8,000 \/ NT\$20,000/);
  assert.match(b, /<div class="fbar over"[^>]*>.*餐飲.*width:100%.*NT\$1,200 \/ NT\$1,000/);
  assert.match(b, /贊助.*還沒填預算/);
});

test("總覽、收支、帳戶、預算、匯出五個畫面畫得出來，英文版不剩中文，改不動的人沒有新增與作廢那幾顆", () => {
  const o = FIN.overview(FIX);
  const edit = { role: "cadre", board: "president", ws: {}, name: "王平" };
  const view = { role: "cadre", board: "senior_adviser", ws: {}, name: "顧" };
  const ov = FIN.overviewHTML(o, FIX, edit, "");
  assert.match(ov, /class="kpi-n">NT\$129,700/, "標題數字是現在全部的錢");
  assert.match(ov, /NT\$123,200<\/div><div class="kpi-l">玉山活存/); assert.match(ov, /NT\$6,500<\/div><div class="kpi-l">現金/);
  assert.match(ov, /NT\$34,200<\/div><div class="kpi-l">這一屆收入/); assert.match(ov, /NT\$8,500<\/div><div class="kpi-l">這一屆支出/);
  assert.match(ov, /<svg /);
  const txp = FIN.txPageHTML(FIN.sortTx(TX), { ...FIX, open: "t1" }, { term: "2026-27", month: "", kind: "", account: "", category: "", q: "" }, edit, "", false, null, {});
  assert.match(txp, /data-act="tx-new"/); assert.match(txp, /<tr class="tx void"/); assert.match(txp, /重複登了/);
  assert.match(txp, /data-autosave="tx-save" data-id="t1"/, "既有的列按「改」展開之後改了就存");
  assert.doesNotMatch(txp, /data-autosave="tx-save" data-id="t2"/, "沒展開的列不畫表單");
  const tv = FIN.txPageHTML(FIN.sortTx(TX), { ...FIX, voiding: "t1" }, { term: "2026-27" }, edit, "", false, null, {});
  assert.match(tv, /id="void-reason"/); assert.match(tv, /data-act="tx-void-go" data-id="t1"/);
  assert.match(txp, /data-act="tx-void" data-id="t1"/);
  assert.doesNotMatch(txp, /data-act="tx-void" data-id="t6"/, "作廢過的沒有再作廢那顆");
  assert.match(txp, /<select name="to_account_id"/);
  const txv = FIN.txPageHTML(FIN.sortTx(TX), FIX, { term: "2026-27" }, view, "", false, null, {});
  assert.doesNotMatch(txv, /data-act="tx-new"/); assert.doesNotMatch(txv, /data-act="tx-void"/); assert.doesNotMatch(txv, /data-autosave=/);
  assert.match(txv, /class="note">.*只能看/, "只看的人上面一句話");
  const nf = FIN.txPageHTML([], FIX, { term: "2026-27" }, edit, "", false, { happened_on: "2026-11-28", kind: "expense", currency: "USD", amount: "", fx_rate: "" }, {});
  assert.match(nf, /data-act="tx-add"/, "新的一列是明確的按鈕");
  assert.match(nf, /name="fx_rate"[^>]*required/, "選了美金就要填匯率");
  const ac = FIN.accountsHTML(ACC, CAT, o, edit, "", false, null, null);
  assert.match(ac, /data-autosave="acc-save" data-id="a1"/); assert.match(ac, /data-act="acc-archive" data-id="a1"/); assert.match(ac, /data-act="acc-new"/);
  assert.match(ac, /data-autosave="cat-save" data-id="c3"/);
  const bu = FIN.budgetHTML(o, FIX, edit, "", false);
  assert.match(bu, /data-autosave="budget-save" data-id="c3"/); assert.match(bu, /value="20000"/);
  const ex = FIN.exportHTML({ term: "2026-27", month: "" }, FIX, 8, "");
  assert.match(ex, /data-act="csv-download"/); assert.match(ex, /8/);
  FIN.setLang("en");
  const strip = s => s.replace(/<!--[\s\S]*?-->/g, "").replace(/(title|aria-label|placeholder|value)="[^"]*"/g, "").replace(/台積電慈善基金會|松菸|便當\n十個|重複登了|玉山活存|現金|嘖嘖|贊助|募資|場地|餐飲/g, "");
  for (const h of [FIN.overviewHTML(FIN.overview(FIX), FIX, edit, ""), FIN.txPageHTML(FIN.sortTx(TX), FIX, { term: "2026-27" }, edit, "", false, { happened_on: "2026-11-28", kind: "income", currency: "TWD" }, {}),
                   FIN.accountsHTML(ACC, CAT, o, edit, "", false, { name_zh: "", name_en: "", kind: "bank", opening_balance: "", opening_on: "2026-11-28" }, { kind: "expense", name_zh: "", name_en: "" }),
                   FIN.budgetHTML(o, FIX, edit, "", false), FIN.exportHTML({ term: "2026-27" }, FIX, 8, ""), FIN.noAccessHTML(view)]) {
    assert.doesNotMatch(strip(h), /[一-鿿]/, "英文版不剩中文");
  }
  FIN.setLang("zh");
});

test("收據：預覽走簽名網址（資料層只呼叫 createSignedUrl，不用 getPublicUrl）；路徑是 <筆的 id>/<時間>-<亂數>.<副檔名>，不用原檔名", () => {
  const d = readFileSync("admin/finance/src/data.js", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.match(d, /from\("receipts"\)\.createSignedUrl\(/);
  assert.doesNotMatch(d, /getPublicUrl/);
  assert.match(d, /from\("receipts"\)\.upload\(/);
  assert.match(FIN.receiptPath("t1", "我的收據 (1).PDF", 1700000000000, "ab12cd"), /^t1\/1700000000000-ab12cd\.pdf$/);
  assert.match(FIN.receiptPath("t1", "photo.jpeg", 1, "x"), /\.jpg$/);
  assert.equal(FIN.receiptOk({ type: "image/png", size: 100 }), "");
  assert.match(FIN.receiptOk({ type: "text/plain", size: 100 }), /圖|PDF/);
  assert.match(FIN.receiptOk({ type: "application/pdf", size: 6 * 1024 * 1024 }), /5 MB/);
});

test("資料層的錯誤翻成人話：不是能看的人、不是能改的人、作廢過的不能改、匯率", () => {
  assert.match(says({ message: "not_finance_viewer" }), /Co-President|Senior Adviser|Sponsorship/);
  assert.match(says({ message: "not_finance_editor" }), /Co-President|Sponsorship/);
  assert.match(says({ message: "tx_voided" }), /作廢/);
  assert.match(says({ message: "need_fx_rate" }), /匯率/);
  assert.match(says({ message: "transfer_needs_two_accounts" }), /兩個/);
  assert.match(says({ message: "same_account" }), /同一個/);
  assert.match(says({ message: "bad_amount" }), /大於 0/);
  assert.match(says({ message: "Bucket not found" }), /2026-11-08-finance\.sql/);
  assert.equal(says({ message: "something else" }), "something else");
});

test("★ 四個守門清單都把 admin/finance 算進去（換版、pre-commit、reduced-motion、手機版面）", () => {
  assert.match(readFileSync("scripts/bump-version.sh", "utf8"), /FOLDERS="[^"]*admin\/finance[^"]*"/);
  assert.match(readFileSync("scripts/pre-commit-bump.sh", "utf8"), /admin\/finance\/index\.html/);
  assert.match(readFileSync("check-motion.mjs", "utf8"), /"admin\/finance\/index\.html"/);
  assert.match(readFileSync("scripts/check-mobile.mjs", "utf8"), /"admin\/finance\/_audit\.html"/);
  assert.match(readFileSync("scripts/mobile-fixtures.mjs", "utf8"), /make\("admin\/finance"/);
  const smoke = readFileSync("scripts/db/smoke.sh", "utf8");
  assert.match(smoke, /2026-11-08-finance\.sql/);
  for (const f of ["admin/finance/src/main.js"]) {
    const s = readFileSync(f, "utf8");
    assert.doesNotMatch(s, /(^|[^.\w])confirm\(/m);
    assert.match(s, /UI\.afterRender\(S, el\)/); assert.match(s, /addEventListener\("popstate"/); assert.match(s, /history\.pushState/);
    assert.match(s, /function paintShell\(/); assert.match(s, /UI\.checkVersion\(/); assert.match(s, /UI\.bindAutosave\(/);
  }
  const h = readFileSync("admin/finance/index.html", "utf8");
  assert.match(h, /<nav class="rail skel"/); assert.match(h, /<meta name="bt-version" content="[^"]+">/); assert.match(h, /<script type="importmap">/);
  assert.match(h, /prefers-reduced-motion:reduce/);
});
