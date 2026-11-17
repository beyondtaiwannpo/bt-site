// /stories/ 的中英字典。畫面上每一個不是從劇本（script.json）或人物（people.json）來的字都在這裡。
// 改字只改這裡。zh 在前，因為這一頁的讀者主要是台灣的家長與校友（Paul 2026-11-16 定：中文優先、英文切換）。
export const STR = {
  title:        { zh: "走一遍這一年", en: "Walk a student's year" },
  sub:          { zh: "挑一個公立高中生，走一遍他申請的那一年。三分鐘。", en: "Pick a public high school student and walk their application year. Three minutes." },
  lang:         { zh: "EN", en: "中" },
  langLabel:    { zh: "Switch to English", en: "切換成中文" },
  back:         { zh: "贊助這個計畫", en: "Back this project" },
  pickTitle:    { zh: "挑一個學生", en: "Pick a student" },
  pickLead:     { zh: "三個學生，三種起點。每一個選擇都是真實學員那一年真的面對過的。沒有對錯，兩條路都走得下去。", en: "Three students, three starting points. Every choice is one a real student faced that year. No right answers. Both roads go on." },
  pickGo:       { zh: "走他的這一年", en: "Walk their year" },
  sceneOf:      { zh: "第 {n} 關，共 {total} 關", en: "Scene {n} of {total}" },
  next:         { zh: "下一關", en: "Next" },
  toEnd:        { zh: "看結尾", en: "See the ending" },
  btDid:        { zh: "這一關 BT 做了什麼", en: "What BT did here" },
  youMet:       { zh: "這時候在你旁邊的人", en: "Who was beside you" },
  wallHint:     { zh: "牆上是探索營現場的便利貼。點一張看清楚。", en: "The wall is the bootcamp's sticky notes. Tap one to read it." },
  mapHint:      { zh: "亮著的是現在有空的人。", en: "The lights are the people who have time." },
  letterHint:   { zh: "放榜之後，翻開探索營那天寫給一年後自己的信。", en: "After results, open the letter you wrote to your future self at bootcamp." },
  flip:         { zh: "翻開信", en: "Open the letter" },
  endZero:      { zh: "你剛走完的這一年，對學員是 0 元。", en: "The year you just walked cost the student NT$0." },
  endWith:      { zh: "你不是一個人走的。這一年在你旁邊的有：", en: "You did not walk it alone. Beside you this year:" },
  endGate:      { zh: "他最後走的門", en: "The gate they took" },
  endAsk:       { zh: "你走過這一年，或你的孩子正在走。你知道那時候多想有人可以問。", en: "You walked this year, or your child is walking it now. You know how much it meant to have someone to ask." },
  again:        { zh: "換一個學生再走一次", en: "Walk another student" },
  explore:      { zh: "看看 Beyond Taiwan 還做了什麼", en: "See what else Beyond Taiwan does" },
  demoBadge:    { zh: "範例劇本。真實故事與照片由各 team 收齊後換上。", en: "Sample script. Real stories and photos go in once the teams collect them." },
  photoPh:      { zh: "照片位置（待同意）", en: "Photo placeholder (consent pending)" },
  roleCadre:    { zh: "幹部", en: "Cadre" },
  roleAlumni:   { zh: "校友", en: "Alumni" },
  roleParent:   { zh: "家長", en: "Parent" },
  roleStudent:  { zh: "學員", en: "Student" },
  loadFail:     { zh: "劇本載不進來。重新整理一次，還是不行就晚一點再來。", en: "The script could not load. Refresh once, or come back later." },
  noscript:     { zh: "這一頁要開 JavaScript 才走得了。", en: "This page needs JavaScript to walk the year." },
  progress:     { zh: "進度", en: "Progress" },
  shellFlight:  { zh: "機場版", en: "Flight" },
  shellLamp:    { zh: "點燈版", en: "Lamp" },
  motionOff:    { zh: "這一版沒有動畫，內容一樣。", en: "This version has no animation. Same content." },
};
export function t(key, lang, vars) {
  const e = STR[key]; if (!e) return key;
  let s = e[lang] || e.zh;
  if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
  return s;
}
// 嘖嘖的連結。3/23 之前連搶先看頁，之後連專案頁；兩個網址都還沒有，先放嘖嘖首頁。拿到真的網址只改這一行。
export const ZECZEC_URL = "https://www.zeczec.com/";
