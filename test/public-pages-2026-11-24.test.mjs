// /partner/ 與 /about/ 2026-11-24 的改版：只換版面，不換字、不加新數字。跑法：node --test test/public-pages-2026-11-24.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const partner = readFileSync("partner/index.html", "utf8"), about = readFileSync("about/index.html", "utf8"), impact = readFileSync("impact/index.html", "utf8");
const body = h => h.slice(h.indexOf("<main"), h.indexOf("</main>"));

test("★ /partner/ 上的數字每一格都跟 /impact/ 一字不差（不在這一頁另外寫一份會走鐘的數字）", () => {
  const nums = [...body(partner).matchAll(/<li><b>[^<]*<\/b><i>[^<]*<\/i><span>[^<]*<\/span><\/li>/g)].map(m => m[0]);
  assert.equal(nums.length, 8, "中英各四格");
  for (const n of nums) assert.ok(impact.includes(n), "這一格 /impact/ 上沒有：" + n);
  assert.equal((body(partner).match(/<a href="\.\.\/impact\/">(這些數字怎麼來的|Where these numbers come from)<\/a>/g) || []).length, 2, "數字底下要連到怎麼算的那一頁");
});

test("★ /partner/ 的用語紅線：只有贊助與支持", () => {
  for (const w of ["捐款", "善款", "愛心", "donat", "charity"]) assert.ok(!body(partner).toLowerCase().includes(w), "出現了不准用的字：" + w);
  for (const s of ["美國在臺協會 AIT", "EducationUSA", "TRÈS BON 好伴 café", "臺北市立第一女子高級中學", "日常營運", "暑期探索營", "導生配對計畫",
    "學員不收費是刻意的設計，不是還沒開始收。", "我們是學生組織，幹部都在上學，回信可能不會太快，但每一封都會看。", "Support us so the programmes keep running."])
    assert.ok(partner.includes(s), "原本的字不見了：" + s);
  assert.equal((partner.match(/href="mailto:beyondtaiwan2020@gmail\.com"/g) || []).length, 6, "中英各三個寫信的地方：最上面那顆、大字的信箱、句子裡的");
  assert.ok(!/<img[^>]*logo(?!\.png)/.test(body(partner)), "合作單位的 logo 要對方同意才放");
});

test("★ /about/ 只換版面：每一段原本的字都在，照片還是站上本來就有的那兩張", () => {
  for (const s of ["在台灣，「出國念書」常被當成一件家裡有錢才能想的事。", "「我們不是老師，也不是顧問。多數人只比你早走一兩步。」", "學員不收費。這不是還沒開始收，是刻意的設計。",
    "Beyond Taiwan 從 2020 年五月開始，七個人。到現在五年，接近三十位幹部，全部是學生，分布在七個國家。", "In Taiwan, studying abroad is still widely treated as something only well-off families get to consider.",
    "Students pay nothing. This is not a fee we have yet to introduce. It is a deliberate design choice.", "<li><b>看見</b><span>你無法選擇你從未看見的東西。</span></li>", "<li><b>Company</b><span>"])
    assert.ok(about.includes(s), "原本的字不見了：" + s);
  assert.deepEqual([...new Set([...body(about).matchAll(/src="\.\.\/photos\/([a-z-]+)\.jpg"/g)].map(m => m[1]))].sort(), ["hero-listening", "talking-laptop"]);
  for (const m of body(about).matchAll(/<img [^>]*>/g)) assert.match(m[0], /alt="[^"]+"/);
  assert.equal((about.match(/<p class="a-zero" aria-hidden="true">0<\/p>/g) || []).length, 2, "那個大 0 是裝飾，讀螢幕的軟體不唸");
  assert.match(about, /@media \(prefers-reduced-motion:reduce\)\{html\{scroll-behavior:auto\}\*\{animation:none!important;transition:none!important\}\}/, "減少動態效果要全關");
});
