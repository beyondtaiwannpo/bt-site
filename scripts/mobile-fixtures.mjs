// 給 scripts/check-mobile.mjs 用的假頁面。
//
// 登入後的四頁（護照、時間看板、申請管理、設定）沒有 session 就只是一個轉址，
// 量不到任何版面。這一支把那四頁的 <script src=main.js> 換成一段餵假資料的
// 內嵌程式，產生 `<資料夾>/_audit.html`。**跑完由 check-mobile.mjs 刪掉**，
// 不要 commit 進 repo（.gitignore 有擋）。
//
// ⚠ 假資料要用**最長的那一種**：四個功能項全開、名字中英文都有、
// team 兩個。版面是被最長的內容撐爆的，拿短的資料量等於沒量。
import { readFileSync, writeFileSync } from "node:fs";
const nav = `navHTML({ current:CUR, role:"cadre", name:"王平" })`;
const acts = JSON.parse(readFileSync("passport/activities.json","utf8"));

function make(file, cur, body, extra = "") {
  // shared/ 的相對路徑跟資料夾深度走：admin/ 是 ../shared，admin/people/ 是 ../../shared（2026-10-24）。
  const up = "../".repeat(file.split("/").length);
  const boot = `
<script type="module">
import { navHTML } from "${up}shared/nav.js";
${extra}
const CUR = ${JSON.stringify(cur)};
document.getElementById("bt-root").innerHTML = ${nav} + (${body});
</script>`;
  let s = readFileSync(file + "/index.html","utf8");
  s = s.replace(/<script type="module" src="[^"]*main\.js"><\/script>/, boot);
  writeFileSync(file + "/_audit.html", s);
}

make("settings", "settings",
  `settingsHTML({ role:"cadre", email:"cadre@example.com", name_zh:"王平", name_en:"Paul Wang",
    team:"Sponsorship Team, Marketing Team", avatar:"", public_profile:true, public_approved:false,
    title:"Co-President · 2026-27" }, "", false)`,
  `import { settingsHTML } from "./src/ui.js";`);

const M = [["安","","Sponsorship Team",null,null],["林育安","Yu-An Lin","Curriculum Team","America/New_York","2026-09-09"],
  ["姚瑀恩","Yu-En Yao","Mentorship Team","Asia/Taipei","2026-09-05"],["陳品妤","Pin-Yu Chen","Marketing Team","America/Indianapolis","2026-09-05"]];
make("availability", "availability",
  `UI.shellHTML("board", UI.boardHTML(V, new Map(), ["9/7","9/8","9/9","9/10","9/11","9/12","9/13"]), "9/7 - 9/13（本週）", "")`,
  `import * as UI from "./src/ui.js";
   const M = ${JSON.stringify(M)};
   const members = M.map(([zh,en,team,tz,up],i)=>({id:"u"+i,name:zh,alt:en,team,tz,updatedAt:up}));
   const V = { members, slots:new Map(), allTeams: UI.teamsOf(members), team:"" };`);

make("passport", "passport",
  `UI.barHTML(S) + UI.bookHTML(S)`,
  `import * as UI from "./src/ui.js";
   const D = ${JSON.stringify({months:acts.months, activities:acts.activities})};
   const stamps = {"09A":{date:"2026-09-12"},"09B":{date:"2026-09-20"}};
   const S = { page:2, view:"passport", months:D.months, activities:D.activities, stamps, entries:{},
     justStamped:null, tearing:null, flipped:{}, justFlipped:null, photos:{}, milestones:[], visas:{},
     destinations:[], role:"cadre", user:{id:"u1"},
     profile:{ id:"3f2a9c10-0000-4000-8000-000000000001", name_zh:"王平", name_en:"Paul Wang",
               team:"Sponsorship Team", issued:"2026-08-22", motto:"President 2026-27", avatar:"" } };`);

// 實習護照（2026-10-17）。格子用最長的中英文標題，三個分類都有，蓋了兩格。
make("intern-passport", "intern-passport",
  `UI.barHTML(S) + UI.bookHTML(S)`,
  `import * as UI from "./src/ui.js";
   const tasks = [
     {id:"T2627-01",category:"onboard",seq:1,title_zh:"認識 BT 與去年的成果",title_en:"MEET BT AND LAST YEAR",description:"看完 BT 的介紹與去年的成果，寫下一句你最有感覺的事"},
     {id:"T2627-02",category:"onboard",seq:2,title_zh:"第一次會議",title_en:"FIRST MEETING",description:"參加第一次 Internship team 的會議"},
     {id:"T2627-03",category:"onboard",seq:3,title_zh:"認識帶你的人",title_en:"YOUR MENTOR",description:"跟帶你的幹部聊過一次"},
     {id:"T2627-04",category:"project",seq:4,title_zh:"第一個任務",title_en:"FIRST TASK",description:"交出你的第一個任務"},
     {id:"T2627-07",category:"reflect",seq:7,title_zh:"我為什麼來",title_en:"WHY I CAME",description:"三句話"}];
   const S = { page:2, view:"passport", tasks, stamps:{"T2627-01":{date:"2026-10-12"},"T2627-02":{date:"2026-10-20"}},
     entries:{"T2627-01":{note:"第一次開會很緊張但大家都很友善",photo:null}},
     justStamped:null, tearing:null, flipped:{}, justFlipped:null, staff:false, role:"intern", user:{id:"u1"},
     term:{id:"2026-27",title_zh:"2026-27 實習",title_en:"INTERNSHIP 2026-27"},
     profile:{ id:"3f2a9c10-0000-4000-8000-000000000002", name_zh:"實習一號", name_en:"Intern Number One",
               issued:"2026-10-01", motto:"這一期想帶走一件事", avatar:"", term:"2026-27" } };`);

// 後台（2026-10-19 起是側欄外殼）：拿對外那一組最長的一頁（團隊頁）量，側欄用 Co-President 的，每一行都在。
make("admin", "admin",
  `UI.shellHTML("", UI.railHTML("site", "team", { role:"cadre", board:"president", team:"Sponsorship Team, Internship Team", name:"王平" }),
     UI.publicTeamHTML([
     { id:"1", name_zh:"王小明", name_en:"Ming Wang", team:"Curriculum Team", title:"Director · 2026-27",
       avatar:"x", public_approved:true }], "", false))`,
  `import * as UI from "./site/src/ui.js";`);

// 人與權限（2026-10-24）：拿最長的一頁「改一個人」量，中英文名、兩屆職位、兩個工作區、刪除成員第二步全開。
make("admin/people", "admin",
  `UI.shellHTML("", UI.railHTML("people", "roster", { role:"cadre", board:"president", team:"Sponsorship Team, Internship Team", name:"王平" }),
     UI.personEditHTML(P, TERMS, "me", true, "", false, null, [P], { typed:"" }))`,
  `import * as UI from "./src/ui.js";
   const TERMS = [{ id:"2026-27", title_zh:"2026-27 屆", title_en:"TERM 2026-27", starts_on:"2026-08-01", ends_on:"2027-07-31", status:"current" },
                  { id:"2025-26", title_zh:"", title_en:"", starts_on:"2025-08-01", ends_on:"2026-07-31", status:"ended" }];
   const P = { person_id:"p2", profile_id:"u2", name_zh:"林育安", name_en:"Yu-An Lin", role:"cadre", board_role:"director", team:"Curriculum Team, Internship Team",
     positions:[{ term:"2026-27", title_zh:"Curriculum 的 Director", title_en:"Director, Curriculum Team", team:"Curriculum Team" },
                { term:"2025-26", title_en:"Associate, Curriculum Team", team:"Curriculum Team" }],
     workspaces:[{ id:"apps:Curriculum Team", level:"manage" }, { id:"res:Curriculum Team", level:"manage" }, { id:"intern-passport", level:"edit" }], maybe_dup:null };`);
// 財務（2026-11-08）：收支那一頁最長（篩選列、新的一筆表單、一筆展開在改、一筆在問作廢原因、作廢過的一筆、美金的一筆）。
make("admin/finance", "admin",
  `UI.shellHTML("", UI.railHTML("finance", "tx", { role:"cadre", board:"president", team:"", name:"王平" }),
     UI.txPageHTML(UI.sortTx(TX), { terms:TERMS, accounts:ACC, categories:CAT, budgets:[], term:TERMS[0], today:"2026-11-28", open:"t2", voiding:"t1" }, { term:"2026-27", month:"", kind:"", account:"", category:"", q:"" },
       { role:"cadre", board:"president", ws:{} }, "", false, { happened_on:"2026-11-28", kind:"transfer", currency:"USD", amount:"1200", fx_rate:"" }, {}))`,
  `import * as UI from "./src/ui.js";
   const TERMS = [{ id:"2026-27", starts_on:"2026-08-01", ends_on:"2027-07-31", status:"current" }];
   const ACC = [{ id:"a1", name_zh:"玉山活存帳戶（協會）", name_en:"E.Sun checking (association)", kind:"bank", currency:"TWD", opening_balance:100000, opening_on:"2026-11-08", sort:10 },
                { id:"a2", name_zh:"現金", name_en:"Cash box", kind:"cash", currency:"TWD", opening_balance:5000, opening_on:"2026-11-08", sort:20 }];
   const CAT = [{ id:"c1", kind:"income", name_zh:"贊助", name_en:"Sponsorship", sort:10 }, { id:"c3", kind:"expense", name_zh:"場地", name_en:"Venue", sort:10 }];
   const TX = [{ id:"t1", happened_on:"2026-11-10", kind:"income", amount:30000, currency:"TWD", amount_twd:30000, account_id:"a1", category_id:"c1", counterparty:"台積電慈善基金會（2026 年度探索營贊助）", note:"匯款單在 Drive 的 2026 贊助資料夾", receipt_path:"t1/x.pdf", term_id:"2026-27" },
               { id:"t2", happened_on:"2026-11-12", kind:"expense", amount:8000, currency:"TWD", amount_twd:8000, account_id:"a1", category_id:"c3", counterparty:"松山文創園區", note:"", term_id:"2026-27" },
               { id:"t3", happened_on:"2026-11-15", kind:"transfer", amount:2000, currency:"TWD", amount_twd:2000, account_id:"a1", to_account_id:"a2", term_id:"2026-27" },
               { id:"t5", happened_on:"2026-12-01", kind:"income", amount:1234.5, currency:"USD", fx_rate:32.15, amount_twd:39689.18, account_id:"a1", category_id:"c1", counterparty:"Overseas alumni donation", term_id:"2026-27" },
               { id:"t6", happened_on:"2026-11-25", kind:"expense", amount:999, currency:"TWD", amount_twd:999, account_id:"a1", category_id:"c3", voided_at:"2026-11-26T00:00:00Z", void_reason:"重複登了，跟 11/12 那一筆是同一張發票", term_id:"2026-27" }];`);
console.log("ok");
