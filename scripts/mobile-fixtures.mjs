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
  const boot = `
<script type="module">
import { navHTML } from "../shared/nav.js";
${extra}
const CUR = ${JSON.stringify(cur)};
document.getElementById("bt-root").innerHTML = ${nav} + (${body});
</script>`;
  let s = readFileSync(file + "/index.html","utf8");
  s = s.replace(/<script type="module" src="[^"]*main\.js"><\/script>/, boot);
  writeFileSync(file + "/_audit.html", s);
}

make("settings", "settings",
  `settingsHTML({ role:"cadre", email:"pinwang.0705@gmail.com", name_zh:"王平", name_en:"Paul Wang",
    team:"Sponsorship Team, Marketing Team", avatar:"", public_profile:true, public_approved:false,
    public_title:"Co-President 2026-2027" }, "", false)`,
  `import { settingsHTML } from "./src/ui.js";`);

const M = [["安","","Sponsorship Team",null,null],["林育安","Yu-An Lin","Curriculum Team","America/New_York","2026-09-09"],
  ["姚瑀恩","Yu-En Yao","Mentorship Team","Asia/Taipei","2026-09-05"],["陳品妤","Pin-Yu Chen","Marketing Team","America/Indianapolis","2026-09-05"]];
make("availability", "availability",
  `UI.shellHTML("who", UI.membersHTML(V, Date.now()), null, "")`,
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

make("admin", "admin",
  `UI.tabsHTML("team", true) + UI.publicTeamHTML([
     { id:"1", name_zh:"王小明", name_en:"Ming Wang", team:"Curriculum Team", public_title:"Director",
       avatar:"x", public_approved:true }], "", false)`,
  `import * as UI from "./src/ui.js";`);
console.log("ok");
