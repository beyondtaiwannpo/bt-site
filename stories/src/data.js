// /stories/ 的資料：讀兩份 JSON、整理成畫面要的形狀、算網址。純函式，測試直接 import。
// 劇本與人物分開（Paul 2026-10-13 定）：劇本是 script.json，人是 people.json。這裡把兩邊接起來。

export const SCENE_IDS = ["hall", "hear", "camp", "mentor", "list", "family", "essay", "result"];
export const PERSONA_IDS = ["a", "b", "c"];
export const TEAMS = ["Curriculum", "Mentorship", "Internship", "CR", "Sponsorship", "Marketing"];
export const COUNTIES = ["台北", "新竹", "台中", "彰化", "嘉義", "台南", "高雄", "屏東", "花蓮", "宜蘭", "台東", "桃園", "苗栗", "雲林", "南投", "基隆"];

const str = v => (typeof v === "string" ? v : "");

// 人：沒有 consent_date 的一筆不進清單（跟 /alumni/ 同一條規則：沒同意就不顯示，劇本指到也一樣）。
export function normalizePeople(raw) {
  const list = raw && Array.isArray(raw.people) ? raw.people : [];
  const out = new Map();
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    const code = str(p.code).trim();
    if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(str(p.consent_date))) continue;
    out.set(code, {
      code, role: ["cadre", "alumni", "parent", "student"].includes(p.role) ? p.role : "cadre",
      name_zh: str(p.name_zh), name_en: str(p.name_en) || str(p.name_zh),
      county: COUNTIES.includes(p.county) ? p.county : "",
      country_zh: str(p.country_zh), country_en: str(p.country_en) || str(p.country_zh), city: str(p.city),
      line_zh: str(p.line_zh), line_en: str(p.line_en) || str(p.line_zh),
      story_zh: str(p.story_zh), story_en: str(p.story_en) || str(p.story_zh),
      photo: str(p.photo), consent_date: p.consent_date,
    });
  }
  return out;
}

// 劇本：三個 persona 照 id 排（a b c），每個八關照 SCENE_IDS 排；關數不對、選項不是兩個的 persona 整個丟掉，畫面不會畫一半。
export function normalizeScript(raw, people) {
  const src = raw && Array.isArray(raw.personas) ? raw.personas : [];
  const personas = [];
  for (const id of PERSONA_IDS) {
    const p = src.find(x => x && x.id === id); if (!p) continue;
    const scenes = [];
    for (const sid of SCENE_IDS) {
      const s = (p.scenes || []).find(x => x && x.id === sid); if (!s) break;
      const choices = Array.isArray(s.choices) ? s.choices.slice(0, 2) : [];
      if (choices.length !== 2) break;
      scenes.push({
        id: sid, kind: ["choice", "wall", "map", "letter"].includes(s.kind) ? s.kind : "choice",
        title_zh: str(s.title_zh), title_en: str(s.title_en) || str(s.title_zh),
        situation_zh: str(s.situation_zh), situation_en: str(s.situation_en) || str(s.situation_zh),
        choices: choices.map(c => ({
          label_zh: str(c.label_zh), label_en: str(c.label_en) || str(c.label_zh),
          quote_zh: str(c.quote_zh), quote_en: str(c.quote_en) || str(c.quote_zh),
          quote_meta_zh: str(c.quote_meta_zh), quote_meta_en: str(c.quote_meta_en) || str(c.quote_meta_zh),
          bt_zh: str(c.bt_zh), bt_en: str(c.bt_en) || str(c.bt_zh),
          team: TEAMS.includes(c.team) ? c.team : "",
          // 人要在 people 裡而且有同意，不然當作沒有人（畫面少一個人，不會破）。
          person: people && people.has(str(c.person)) ? people.get(str(c.person)) : null,
        })),
      });
    }
    if (scenes.length !== SCENE_IDS.length) continue;
    personas.push({
      id, tag_zh: str(p.tag_zh), tag_en: str(p.tag_en) || str(p.tag_zh),
      grade_zh: str(p.grade_zh), grade_en: str(p.grade_en) || str(p.grade_zh),
      start_zh: str(p.start_zh), start_en: str(p.start_en) || str(p.start_zh),
      gate_zh: str(p.gate_zh), gate_en: str(p.gate_en) || str(p.gate_zh),
      outcome_zh: str(p.outcome_zh), outcome_en: str(p.outcome_en) || str(p.outcome_zh),
      letter_zh: str(p.letter_zh), letter_en: str(p.letter_en) || str(p.letter_zh),
      letter_meta_zh: str(p.letter_meta_zh), letter_meta_en: str(p.letter_meta_en) || str(p.letter_meta_zh),
      scenes,
    });
  }
  const notes = (raw && Array.isArray(raw.notes) ? raw.notes : []).filter(n => n && str(n.text_zh))
    .map(n => ({ id: str(n.id), text_zh: str(n.text_zh), text_en: str(n.text_en) || str(n.text_zh), session_zh: str(n.session_zh), session_en: str(n.session_en) || str(n.session_zh) }));
  return { demo: !!(raw && raw.demo), personas, notes };
}

// 網址：#a #b #c 是哪一個學生（可以分享直接進某一個）。進度不存在網址裡，重整就重走（三分鐘的東西不用記）。
export function personaFromHash(hash) {
  const m = /^#([abc])$/.exec(hash || "");
  return m ? m[1] : "";
}
export const hashFor = id => (PERSONA_IDS.includes(id) ? "#" + id : "");

// 網址的 ?from=zeczec：從嘖嘖來的人只有兩條路（繼續看、回去贊助），結尾不給「看看 BT 還做了什麼」那顆。
export const fromZeczec = search => new URLSearchParams(search || "").get("from") === "zeczec";
// 哪一個殼：?shell=flight 或 lamp。Paul 比較過之後留一個，到時候這裡改預設值就好。
export function shellFromSearch(search, fallback) {
  const v = new URLSearchParams(search || "").get("shell");
  return v === "flight" || v === "lamp" ? v : (fallback || "lamp");
}
// 走到哪：第 i 關（0 起算）選了之後的進度，結尾是 1。
export const progressOf = (i, chosen, total) => total ? Math.min(1, (i + (chosen ? 1 : 0.5)) / total) : 0;

// 這一年裡出現過的人，照出現順序、不重複。結尾那一屏要列。
export function peopleMet(persona, picks) {
  const out = [], seen = new Set();
  persona.scenes.forEach((s, i) => {
    const k = picks[i]; if (k !== 0 && k !== 1) return;
    const p = s.choices[k].person; if (p && !seen.has(p.code)) { seen.add(p.code); out.push(p); }
  });
  return out;
}

export async function loadAll(base) {
  const b = base || "./";
  const [s, p] = await Promise.all([fetch(b + "script.json").then(r => r.json()), fetch(b + "people.json").then(r => r.json())]);
  const people = normalizePeople(p);
  return { script: normalizeScript(s, people), people };
}
