// shared/forms.js：三套表單共用的表單引擎（2026-11-13，Paul 要「每一個表單編輯器都像 Tally」）。
//
// 誰在用：/apply/（對外的申請與報名）、/admin/（申請表的編輯器）、/admin/team-forms/（內部表單）、
// /admin/records/ 與 /feedback/（回饋表）。每一個資料夾各自讀寫自己的資料表，**這一支不碰資料庫**，
// 也不 import 任何功能資料夾（check.sh 守著依賴方向只往下）。
//
// 這一支分三層，越上面越純：
//   1. 純函式：題型、把一題整理成同一個形狀、分頁、條件邏輯、驗證、把答案變成要送出的形狀、
//      從網址帶入答案、隱藏欄位、表單什麼時候自己關起來。test/forms-engine.test.mjs 逐條守著。
//   2. 畫 HTML 的函式：一題長什麼樣、進度條、編輯器的一塊。只回字串，不碰 DOM。
//   3. 跟 DOM 打交道的兩樣：runner（對外那一頁一頁填的表單）與編輯器的讀值、存草稿。
//
// 一題的形狀（三套資料表各自轉成這個形狀再交進來，見各資料夾的 data.js）：
//   { id, key, type, label, help, required, options: [], config: {}, logic: [] }
// config 放題型自己的設定（字數、數字範圍、分數的兩端、檔案大小…），logic 是這一題的規則：
//   { match: "all"|"any", when: [{ q, op, v }], do: "show"|"hide"|"require"|"jump", target }
// 規則存在「打開它的那一題」上，target 是被影響的那一題（或跳到哪一頁）。
// 為什麼是這樣存、條件邏輯在伺服器那一端怎麼處理，見 README「表單引擎」。

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export { esc };

// ── 字 ─────────────────────────────────────────────────────────────────
// 引擎自己畫的字（驗證訊息、按鈕、編輯器）中英兩版都在這裡。題目本身是單語的（一份表單一種語言，2026-09-07 拍板）。
const W = {
  required: ["這一題要填。", "This one is required."],
  consent: ["要勾這一格才能送出。", "Please tick this box to continue."],
  email: ["email 的格式不對，像 name@example.com 這樣。", "That email does not look right. Try name@example.com."],
  phone: ["電話的格式不對，只寫數字，可以加 + 與空格。", "That phone number does not look right. Digits, spaces and + only."],
  number: ["這一格要填數字。", "Please enter a number."],
  numMin: ["最小是 {n}。", "The smallest allowed is {n}."],
  numMax: ["最大是 {n}。", "The largest allowed is {n}."],
  minLen: ["至少寫 {n} 個字。", "Please write at least {n} characters."],
  maxLen: ["最多 {n} 個字，現在是 {m} 個。", "At most {n} characters; this is {m}."],
  date: ["日期的格式不對。", "That date does not look right."],
  option: ["請從選項裡選。", "Please pick one of the options."],
  otherEmpty: ["選了「其他」就寫一下是什麼。", "You picked Other, please say what."],
  scale: ["請選一個分數。", "Please pick a number."],
  fileBig: ["檔案太大了，最大 {n} MB。", "That file is too big. The limit is {n} MB."],
  fileType: ["這種檔案收不了，請傳 {t}。", "That kind of file cannot be uploaded. Please use {t}."],
  next: ["下一頁", "Next"],
  back: ["上一頁", "Back"],
  submit: ["送出", "Submit"],
  sending: ["送出中…", "Sending…"],
  step: ["第 {i} 頁，共 {n} 頁", "Page {i} of {n}"],
  other: ["其他", "Other"],
  otherPh: ["寫一下是什麼", "Please specify"],
  pick: ["請選擇", "Choose…"],
  agree: ["我同意", "I agree"],
  fix: ["有 {n} 題要再看一下。", "{n} answers need another look."],
  upload: ["選一個檔案", "Choose a file"],
  uploading: ["上傳中…", "Uploading…"],
  uploaded: ["已經上傳：", "Uploaded: "],
  uploadedOne: ["檔案已經上傳了。", "Your file is uploaded."],
  replace: ["換一個", "Replace"],
  fileHint: ["最大 {n} MB，{t}。", "Up to {n} MB, {t}."],
  draftKept: ["這台裝置會先記住你填到哪，重新整理也不會不見；送出之後就清掉。", "This device remembers your answers so a refresh does not lose them. They are cleared once you submit."],
  draftClear: ["清掉這台裝置上的草稿", "Clear the draft on this device"],
  preview: ["預覽：這是填的人看到的樣子，題目邏輯照樣會動，按送出不會真的送出。", "Preview: this is what people filling it in see. Logic works; Submit does not send anything."],
  previewSent: ["預覽不會送出。真的送出時要填的都填了。", "Preview does not send. Everything required is filled in."],
};
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : ""));
export const say = (k, en, v) => fill((W[k] || [k, k])[en ? 1 : 0], v);

// ── 1. 題型 ───────────────────────────────────────────────────────────
// input：會收答案的題。不是 input 的是排版用的區塊（標題、一段說明、換頁），不會被驗證也不會被送出。
// choice：有選項。text：打字的。
export const TYPES = [
  { v: "short",    input: true,  text: true,  zh: "短答",        en: "Short answer" },
  { v: "long",     input: true,  text: true,  zh: "長答",        en: "Long answer" },
  { v: "email",    input: true,  text: true,  zh: "Email",       en: "Email" },
  { v: "phone",    input: true,  text: true,  zh: "電話",        en: "Phone" },
  { v: "number",   input: true,  text: true,  zh: "數字",        en: "Number" },
  { v: "date",     input: true,  text: true,  zh: "日期",        en: "Date" },
  { v: "single",   input: true,  choice: true, zh: "單選",       en: "Multiple choice" },
  { v: "multi",    input: true,  choice: true, zh: "多選",       en: "Checkboxes" },
  { v: "dropdown", input: true,  choice: true, zh: "下拉選單",   en: "Dropdown" },
  { v: "scale",    input: true,  zh: "1 到 N 的分數", en: "Linear scale" },
  { v: "consent",  input: true,  zh: "同意勾選",    en: "Consent checkbox" },
  { v: "file",     input: true,  zh: "上傳檔案",    en: "File upload" },
  { v: "heading",  input: false, zh: "小標題",      en: "Heading" },
  { v: "text",     input: false, zh: "一段說明",    en: "Text block" },
  { v: "page",     input: false, zh: "換頁",        en: "Page break" },
];
const TYPE = Object.fromEntries(TYPES.map(t => [t.v, t]));
export const typeOf = v => TYPE[v] || TYPE.short;
export const typeLabel = (v, en) => en ? typeOf(v).en : typeOf(v).zh;
export const isInput = q => !!q && !!typeOf(q.type).input && !!TYPE[q.type];
export const isChoice = q => !!q && !!typeOf(q.type).choice;
// 每一套表單收得了哪些題型（資料表的 check 不一樣）。沒列的題型不會出現在「加一題」的選單裡。
export const ALL_TYPES = TYPES.map(t => t.v);

// 檔案：收哪幾種。值是 accept 屬性與副檔名清單，伺服器那一端（storage bucket）另外有一份上限。
export const FILE_KINDS = {
  pdf:   { zh: "PDF", en: "PDF", mime: ["application/pdf"], ext: ["pdf"] },
  image: { zh: "圖片（JPG、PNG）", en: "images (JPG, PNG)", mime: ["image/jpeg", "image/png", "image/webp"], ext: ["jpg", "jpeg", "png", "webp"] },
  doc:   { zh: "PDF 或 Word", en: "PDF or Word", mime: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ext: ["pdf", "doc", "docx"] },
  any:   { zh: "PDF、Word 或圖片", en: "PDF, Word or images", mime: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/webp"], ext: ["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp"] },
};
export const FILE_MAX_MB = 10;   // 跟 storage bucket 的 file_size_limit 一樣（2026-12-22-form-uploads.sql）

const num = v => (v === "" || v == null || !isFinite(Number(v))) ? null : Number(v);
// 已經整理過的就不再整理一次（normalize 會補 _n）。
const N = q => (q && q._n) ? q : normalize(q);

// 一題整理成同一個形狀。缺的欄位補預設值，型別不對的修掉。**交進引擎的每一題都先過這一支。**
export function normalize(q) {
  const t = TYPE[q && q.type] ? q.type : "short";
  const c = Object.assign({}, (q && q.config && typeof q.config === "object") ? q.config : {});
  // 回饋表與內部表單的分數題把兩端放在自己的欄位（scale_min、scale_max、min_label、max_label），收進 config。
  for (const k of ["scale_min", "scale_max", "min_label", "max_label"]) if (q && q[k] != null && c[k] == null) c[k] = q[k];
  if (t === "scale") {
    c.scale_min = num(c.scale_min) == null ? 1 : Math.round(num(c.scale_min));
    c.scale_max = num(c.scale_max) == null ? 5 : Math.round(num(c.scale_max));
    if (c.scale_max <= c.scale_min) c.scale_max = c.scale_min + 1;
    if (c.scale_max - c.scale_min > 10) c.scale_max = c.scale_min + 10;
  }
  if (t === "file") {
    c.accept = FILE_KINDS[c.accept] ? c.accept : "any";
    c.max_mb = Math.min(FILE_MAX_MB, Math.max(1, num(c.max_mb) || FILE_MAX_MB));
  }
  const logic = Array.isArray(q && q.logic) ? q.logic.filter(r => r && typeof r === "object").map(r => ({
    match: r.match === "any" ? "any" : "all",
    when: (Array.isArray(r.when) ? r.when : []).filter(w => w && w.q).map(w => ({ q: String(w.q), op: OPS_BY[w.op] ? w.op : "is", v: w.v == null ? "" : w.v })),
    do: ["show", "hide", "require", "jump"].includes(r.do) ? r.do : "show",
    target: r.target == null ? "" : String(r.target),
  })) : [];
  return {
    _n: true,
    id: String(q && q.id != null ? q.id : ""),
    key: (q && q.key) ? String(q.key) : "",
    type: t,
    label: (q && q.label) || "",
    help: (q && q.help) || "",
    required: !!(q && q.required) && !!TYPE[t].input,
    options: Array.isArray(q && q.options) ? q.options.map(String).filter(s => s.trim()) : [],
    config: c,
    logic,
  };
}

// ── 2. 分頁 ───────────────────────────────────────────────────────────
// 「換頁」那一塊把題目切成好幾頁。第一頁的 id 是 "p0"；表單第一塊就是換頁的話，它變成第一頁的標題。
// 每一頁：{ id, title, items: [題目] }。跳頁的目標用換頁那一塊的 id，"end" 是直接到送出。
export function pages(items) {
  const out = [{ id: "p0", title: "", items: [] }];
  for (const it of items) {
    if (it.type === "page") {
      const cur = out[out.length - 1];
      if (out.length === 1 && !cur.items.length && cur.id === "p0") { cur.id = it.id; cur.title = it.label; continue; }
      out.push({ id: it.id, title: it.label, items: [] });
    } else out[out.length - 1].items.push(it);
  }
  return out;
}

// ── 3. 條件邏輯 ───────────────────────────────────────────────────────
// 運算子跟 Tally 那一份一樣。value 是那一題現在的答案：文字題是字串，多選是陣列。
export const OPS = [
  { v: "is",        zh: "是",        en: "is",              needs: true },
  { v: "is_not",    zh: "不是",      en: "is not",          needs: true },
  { v: "any_of",    zh: "是其中之一", en: "is any of",       needs: true, many: true },
  { v: "contains",  zh: "包含",      en: "contains",        needs: true },
  { v: "empty",     zh: "沒填",      en: "is empty",        needs: false },
  { v: "not_empty", zh: "有填",      en: "is not empty",    needs: false },
  { v: "gt",        zh: "大於",      en: "is greater than", needs: true, numeric: true },
  { v: "lt",        zh: "小於",      en: "is less than",    needs: true, numeric: true },
];
const OPS_BY = Object.fromEntries(OPS.map(o => [o.v, o]));
export const OTHER = "__other__";   // 「其他」那個選項在條件裡的代號：答案不在選項裡就算
const low = s => String(s == null ? "" : s).trim().toLowerCase();
const isEmpty = v => Array.isArray(v) ? v.length === 0 : String(v == null ? "" : v).trim() === "";
const asList = v => Array.isArray(v) ? v : (isEmpty(v) ? [] : [String(v)]);

// 一個條件成不成立。q 是被問的那一題（要知道它的選項才能判斷「其他」）。
export function condHolds(c, value, q) {
  const op = c.op, want = c.v;
  const vals = asList(value);
  const opts = (q && q.options) || [];
  const match1 = (have, w) => w === OTHER ? (have !== "" && !opts.includes(have)) : low(have) === low(w);
  switch (op) {
    case "empty": return isEmpty(value);
    case "not_empty": return !isEmpty(value);
    case "is": return vals.some(h => match1(h, want));
    case "is_not": return !vals.some(h => match1(h, want));
    case "any_of": { const ws = Array.isArray(want) ? want : String(want).split(/[,，、\n]/).map(s => s.trim()).filter(Boolean); return vals.some(h => ws.some(w => match1(h, w))); }
    case "contains": return !isEmpty(want) && vals.some(h => low(h).includes(low(want)));
    case "gt": case "lt": {
      const a = num(Array.isArray(value) ? value[0] : value), b = num(want);
      if (a == null || b == null) return false;
      return op === "gt" ? a > b : a < b;
    }
    default: return false;
  }
}
export function ruleFires(r, answers, byId) {
  const when = r.when || [];
  if (!when.length) return false;   // 沒有條件的規則不算數，免得一條半成品的規則把題目藏掉
  const one = c => condHolds(c, answers[c.q], byId[c.q]);
  return r.match === "any" ? when.some(one) : when.every(one);
}

// 算整份表單現在的狀態：哪些題看得到、哪些必填、會走過哪幾頁。
// **藏起來的題不必填，答案也不送出**（Paul 2026-11-13 的規格）。一題藏起來之後，靠它當條件的規則也要跟著重算，
// 所以反覆算到不再變為止（最多題數加一輪，規則互相打架的時候停在最後一輪的結果，不會卡住）。
export function evaluate(rawItems, answers) {
  const items = rawItems.map(N);
  const byId = Object.fromEntries(items.map(it => [it.id, it]));
  const pg = pages(items);
  const pageOf = {};
  pg.forEach((p, i) => { for (const it of p.items) pageOf[it.id] = i; });
  const pageIdx = Object.fromEntries(pg.map((p, i) => [p.id, i]));
  const rules = [];
  for (const it of items) for (const r of it.logic) rules.push(Object.assign({ owner: it.id }, r));
  let hidden = new Set(), path = [0], req = new Set();
  for (let round = 0; round <= items.length + 1; round++) {
    const eff = {};
    for (const it of items) if (!hidden.has(it.id) && answers && answers[it.id] != null) eff[it.id] = answers[it.id];
    // 走過哪幾頁：每一頁看它裡面看得到的題有沒有「跳到」的規則成立，第一條成立的贏；只准往後跳，免得繞圈。
    const p2 = [];
    let i = 0, guard = 0;
    while (i < pg.length && guard++ < pg.length + 1) {
      p2.push(i);
      let next = i + 1;
      for (const r of rules) {
        if (r.do !== "jump" || pageOf[r.owner] !== i || hidden.has(r.owner) || !ruleFires(r, eff, byId)) continue;
        if (r.target === "end") { next = pg.length; break; }
        const j = pageIdx[r.target];
        if (j != null && j > i) { next = j; break; }
      }
      i = next;
    }
    const onPath = new Set(p2);
    const h2 = new Set();
    for (const it of items) {
      if (it.type === "page") continue;
      if (!onPath.has(pageOf[it.id])) { h2.add(it.id); continue; }
      const mine = rules.filter(r => r.target === it.id);
      const shows = mine.filter(r => r.do === "show");
      if (shows.length && !shows.some(r => ruleFires(r, eff, byId))) { h2.add(it.id); continue; }
      if (mine.some(r => r.do === "hide" && ruleFires(r, eff, byId))) h2.add(it.id);
    }
    const r2 = new Set();
    for (const it of items) {
      if (!isInput(it) || h2.has(it.id)) continue;
      if (it.required || rules.some(r => r.do === "require" && r.target === it.id && ruleFires(r, eff, byId))) r2.add(it.id);
    }
    const same = h2.size === hidden.size && [...h2].every(x => hidden.has(x)) && p2.join() === path.join();
    hidden = h2; path = p2; req = r2;
    if (same) break;
  }
  return { items, pages: pg, path, hidden, required: req, pageOf,
    visible: id => !hidden.has(id), isRequired: id => req.has(id) };
}

// 一題被不被規則影響（有規則會藏它、叫它必填，或它在一個可能被跳過的頁上）。
// 伺服器那一端只檢查**不被影響**的必填題，被影響的交給前端（理由見 README「條件邏輯在伺服器那一端」）。
export function conditional(rawItems, id) {
  const items = rawItems.map(N);
  const rules = []; items.forEach((it, i) => it.logic.forEach(r => rules.push(Object.assign({ ownerIdx: i }, r))));
  const idx = items.findIndex(it => it.id === id);
  if (rules.some(r => r.target === id && r.do !== "jump")) return true;
  return rules.some(r => r.do === "jump" && r.ownerIdx < idx);
}

// 規則裡指到不存在的題、或跳到不存在的頁，編輯器要講出來（不然那條規則安靜地失效）。
export function brokenRules(rawItems) {
  const items = rawItems.map(normalize);
  const ids = new Set(items.map(i => i.id)), pageIds = new Set(pages(items).map(p => p.id));
  const out = [];
  for (const it of items) it.logic.forEach((r, i) => {
    const badCond = (r.when || []).some(w => !ids.has(w.q));
    const badTarget = r.do === "jump" ? !(r.target === "end" || pageIds.has(r.target)) : !ids.has(r.target);
    if (badCond || badTarget || !(r.when || []).length) out.push({ owner: it.id, rule: i });
  });
  return out;
}

// ── 4. 驗證 ───────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s\-().]{7,22}$/;
export const isEmail = s => EMAIL_RE.test(String(s || "").trim());
export const isPhone = s => PHONE_RE.test(String(s || "").trim()) && String(s).replace(/\D/g, "").length >= 7;
export const DEFAULT_MAX = { short: 500, long: 10000, email: 200, phone: 40, number: 40, date: 10 };
// 日期只吃 yyyy-mm-dd，而且要是真的有那一天（2 月 30 日不算）。
const isDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; };

// 一題的答案對不對。回空字串是沒問題，否則回一句給人看的話。required 是「現在」必不必填（規則算過的）。
export function validate(rawQ, value, en, required) {
  const q = N(rawQ);
  if (!isInput(q)) return "";
  const c = q.config || {};
  const req = required == null ? q.required : !!required;
  if (q.type === "consent") return req && value !== "yes" ? say("consent", en) : "";
  if (isEmpty(value)) return req ? say("required", en) : "";
  if (q.type === "multi") {
    const list = asList(value);
    const bad = list.find(v => !q.options.includes(v) && !c.other);
    if (bad != null) return say("option", en);
    if (list.some(v => !q.options.includes(v) && !String(v).trim())) return say("otherEmpty", en);
    return "";
  }
  const s = String(value).trim();
  if (q.type === "single" && s === OTHER) return say("otherEmpty", en);
  if (q.type === "single" || q.type === "dropdown") return (q.options.includes(s) || (c.other && q.type === "single")) ? "" : say("option", en);
  if (q.type === "scale") { const n = num(s); return (n == null || n !== Math.round(n) || n < c.scale_min || n > c.scale_max) ? say("scale", en) : ""; }
  if (q.type === "email" && !isEmail(s)) return say("email", en);
  if (q.type === "phone" && !isPhone(s)) return say("phone", en);
  if (q.type === "date" && !isDate(s)) return say("date", en);
  if (q.type === "number") {
    const n = num(s);
    if (n == null) return say("number", en);
    if (num(c.min) != null && n < num(c.min)) return say("numMin", en, { n: num(c.min) });
    if (num(c.max) != null && n > num(c.max)) return say("numMax", en, { n: num(c.max) });
    return "";
  }
  if (q.type === "short" || q.type === "long") {
    const len = [...s].length;
    const max = Math.min(num(c.max_len) || DEFAULT_MAX[q.type], DEFAULT_MAX[q.type]);
    if (num(c.min_len) && len < num(c.min_len)) return say("minLen", en, { n: num(c.min_len) });
    if (len > max) return say("maxLen", en, { n: max, m: len });
  }
  return "";
}
// 一頁（或整份，pageIdx 是 null）裡看得到的題逐題驗。回 { 題目 id: 那一句 }。
export function validateAll(ev, answers, en, pageIdx) {
  const out = {};
  for (const it of ev.items) {
    if (!isInput(it) || ev.hidden.has(it.id)) continue;
    if (pageIdx != null && ev.pageOf[it.id] !== pageIdx) continue;
    const m = validate(it, answers[it.id], en, ev.required.has(it.id));
    if (m) out[it.id] = m;
  }
  return out;
}

// 檔案在上傳前先擋一次（大小、種類）。伺服器那一端的 bucket 也有上限，這裡是讓人當下就知道。
export function fileProblem(rawQ, file, en) {
  const q = N(rawQ);
  if (!file) return "";
  const k = FILE_KINDS[q.config.accept] || FILE_KINDS.any;
  if (file.size > q.config.max_mb * 1024 * 1024) return say("fileBig", en, { n: q.config.max_mb });
  const ext = String(file.name || "").split(".").pop().toLowerCase();
  if (!k.mime.includes(file.type) && !k.ext.includes(ext)) return say("fileType", en, { t: en ? k.en : k.zh });
  return "";
}
// 上傳的檔案放在哪：<表單>/<本人>/<題目>-<亂數>.<副檔名>。**不放原本的檔名**：檔名常常就是學生的全名。
export function uploadPath(formId, userId, qid, fileName, rand) {
  const ext = String(fileName || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const r = rand || Math.random().toString(36).slice(2, 10);
  return `${formId}/${userId}/${qid}-${r}.${ext}`;
}

// ── 5. 送出 ───────────────────────────────────────────────────────────
// 存進資料庫一律是文字：多選用換行接起來（application_answers.value 的欄位註解）。
export const toText = (q, v) => Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean).join("\n") : String(v == null ? "" : v).trim();
export const fromText = (q, s) => (q && q.type === "multi") ? String(s || "").split("\n").map(x => x.trim()).filter(Boolean) : String(s == null ? "" : s);
// 只送看得到、會收答案的題。藏起來的題連那一格都不送（Paul 的規格：藏起來的答案不送出）。
export function collect(ev, answers) {
  return ev.items.filter(it => isInput(it) && !ev.hidden.has(it.id))
    .map(it => ({ q: it.id, v: toText(it, answers[it.id]) }));
}

// ── 6. 從網址帶入、隱藏欄位 ───────────────────────────────────────────
// ?q_<代號>=值 帶入那一題（代號是編輯器「進階」裡那一格）。多選用逗號隔開。帶不進去的值（不在選項裡）就不帶。
export function prefill(rawItems, search) {
  const p = new URLSearchParams(search || "");
  const out = {};
  for (const it of rawItems.map(normalize)) {
    if (!it.key || !isInput(it) || it.type === "file") continue;
    const v = p.get("q_" + it.key);
    if (v == null) continue;
    const s = v.slice(0, 500);
    if (it.type === "multi") { const list = s.split(",").map(x => x.trim()).filter(x => it.options.includes(x)); if (list.length) out[it.id] = list; continue; }
    if ((it.type === "single" || it.type === "dropdown") && !it.options.includes(s)) continue;
    if (it.type === "consent") continue;   // 同意要本人勾，網址不能幫他勾
    out[it.id] = s;
  }
  return out;
}
// 隱藏欄位：表單設定裡列的名字（例如 from、utm_source），從網址讀，跟著這一份存起來。值限 200 字。
// 名字只准英文、數字、底線與減號，免得有人在網址上塞奇怪的東西進 jsonb。
export const cleanHiddenNames = list => [...new Set((Array.isArray(list) ? list : String(list || "").split(/[\s,，、]+/))
  .map(s => String(s).trim()).filter(s => /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(s)))].slice(0, 10);
export function hiddenFrom(names, search) {
  const p = new URLSearchParams(search || "");
  const out = {};
  for (const n of cleanHiddenNames(names)) { const v = p.get(n); if (v != null && v !== "") out[n] = v.slice(0, 200); }
  return out;
}

// ── 7. 表單什麼時候自己關起來 ─────────────────────────────────────────
// 回 "" 是開著；"closed" 狀態不是開放或過了截止時間；"not_yet" 還沒到開放時間；"full" 收滿了。
export function closedReason(form, now, count) {
  const t = now == null ? Date.now() : (now instanceof Date ? now.getTime() : now);
  if (!form || form.status !== "open") return "closed";
  if (form.opens_at && new Date(form.opens_at).getTime() > t) return "not_yet";
  if (form.closes_at && new Date(form.closes_at).getTime() < t) return "closed";
  if (form.max_responses && count != null && count >= form.max_responses) return "full";
  if (form.is_full) return "full";
  return "";
}

// ── 8. 草稿（重新整理不會不見）─────────────────────────────────────────
// localStorage，每一句都包 try：無痕視窗或擋了網站資料的瀏覽器會丟例外，那時候照樣能填，只是不留。
// 十四天沒動就當作沒有（共用電腦上不要留太久）。送出成功就清掉。
export const DRAFT_DAYS = 14;
export const draftKey = (formId, userId) => `bt.form.draft.${formId}.${userId || "anon"}`;
export function draftLoad(key, now) {
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d !== "object" || !d.answers) return null;
    if ((now || Date.now()) - (d.t || 0) > DRAFT_DAYS * 86400000) { draftClear(key); return null; }
    return d;
  } catch (e) { return null; }
}
// meta 是隱藏欄位的值（例如 ?from=ig）：登入要離開這一頁，回來的時候網址上已經沒有那些參數了，所以跟著草稿存。
export function draftSave(key, answers, page, meta) {
  if (!key) return false;
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), page: page || 0, answers: answers || {}, meta: meta || {} })); return true; } catch (e) { return false; }
}
export function draftClear(key) { if (!key) return; try { localStorage.removeItem(key); } catch (e) { /* 無痕視窗就算了 */ } }

// ── 9. 畫一題 ─────────────────────────────────────────────────────────
// opts：{ en, err, required, disabled, n }。n 是題號（不給就不印）。值是那一題現在的答案。
export function questionHTML(rawQ, value, opts) {
  const q = N(rawQ);
  const o = opts || {}, en = !!o.en;
  if (q.type === "page") return "";
  if (q.type === "heading") return `<div class="fx-q fx-head" data-fx="${esc(q.id)}"><h3 class="fx-h">${esc(q.label)}</h3>${q.help ? `<p class="fx-help">${esc(q.help)}</p>` : ""}</div>`;
  if (q.type === "text") return `<div class="fx-q fx-txt" data-fx="${esc(q.id)}">${q.label ? `<p class="fx-lead">${esc(q.label).replace(/\n/g, "<br>")}</p>` : ""}${q.help ? `<p class="fx-help">${esc(q.help).replace(/\n/g, "<br>")}</p>` : ""}</div>`;
  const id = "fx-" + q.id, req = o.required == null ? q.required : o.required;
  const reqTag = req ? ` <span class="fx-req">*${en ? "required" : "必填"}</span>` : "";
  const errId = id + "-err";
  const lab = q.type === "consent" ? "" : (isChoice(q) && q.type !== "dropdown") || q.type === "scale"
    ? `<p class="fx-label" id="${id}-l">${o.n ? `<span class="fx-n">${o.n}.</span> ` : ""}${esc(q.label)}${reqTag}</p>`
    : `<label class="fx-label" for="${id}">${o.n ? `<span class="fx-n">${o.n}.</span> ` : ""}${esc(q.label)}${reqTag}</label>`;
  return `<div class="fx-q${o.err ? " fx-bad" : ""}" data-fx="${esc(q.id)}">
    ${lab}
    ${q.help && q.type !== "consent" ? `<p class="fx-help">${esc(q.help).replace(/\n/g, "<br>")}</p>` : ""}
    ${fieldHTML(q, value, o, id, errId, reqTag)}
    <p class="fx-err" id="${errId}" role="alert"${o.err ? "" : " hidden"}>${esc(o.err || "")}</p>
  </div>`;
}
function fieldHTML(q, value, o, id, errId, reqTag) {
  const en = !!o.en, dis = o.disabled ? " disabled" : "", c = q.config || {};
  const desc = ` aria-describedby="${errId}"${o.err ? ' aria-invalid="true"' : ""}`;
  const v = value == null ? "" : value;
  const nm = ` name="${esc(id)}" data-fxq="${esc(q.id)}"`;
  const ph = c.placeholder ? ` placeholder="${esc(c.placeholder)}"` : "";
  switch (q.type) {
    case "long": return `<textarea id="${id}"${nm}${desc}${ph}${dis} maxlength="${Math.min(num(c.max_len) || DEFAULT_MAX.long, DEFAULT_MAX.long)}">${esc(v)}</textarea>`;
    case "email": return `<input id="${id}"${nm}${desc}${ph}${dis} type="email" inputmode="email" autocomplete="email" spellcheck="false" value="${esc(v)}">`;
    case "phone": return `<input id="${id}"${nm}${desc}${ph}${dis} type="tel" inputmode="tel" autocomplete="tel" value="${esc(v)}">`;
    case "number": return `<input id="${id}"${nm}${desc}${ph}${dis} type="text" inputmode="decimal" value="${esc(v)}">`;
    case "date": return `<input id="${id}"${nm}${desc}${dis} type="date" value="${esc(v)}">`;
    case "dropdown": return `<select id="${id}"${nm}${desc}${dis}><option value="">${esc(say("pick", en))}</option>${q.options.map(x => `<option${x === v ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
    case "single": case "multi": {
      const t = q.type === "single" ? "radio" : "checkbox";
      const have = asList(v);
      const otherVal = have.find(h => !q.options.includes(h));
      const opts = q.options.map((x, i) => `<label class="fx-opt"><input type="${t}"${nm} value="${esc(x)}"${have.includes(x) ? " checked" : ""}${dis}><span>${esc(x)}</span></label>`).join("");
      const other = c.other ? `<label class="fx-opt fx-other"><input type="${t}"${nm} value="${OTHER}"${otherVal != null ? " checked" : ""}${dis}><span>${esc(say("other", en))}</span>
        <input type="text" class="fx-other-in" data-fxother="${esc(q.id)}" aria-label="${esc(say("otherPh", en))}" placeholder="${esc(say("otherPh", en))}" value="${esc(otherVal && otherVal !== OTHER ? otherVal : "")}"${dis} maxlength="200"></label>` : "";
      return `<div class="fx-opts" role="${q.type === "single" ? "radiogroup" : "group"}" aria-labelledby="${id}-l"${desc}>${opts}${other}</div>`;
    }
    case "scale": {
      const nums = []; for (let n = c.scale_min; n <= c.scale_max; n++) nums.push(n);
      return `<div class="fx-scale" role="radiogroup" aria-labelledby="${id}-l"${desc}>
        <div class="fx-nums">${nums.map(n => `<label class="fx-num"><input type="radio"${nm} value="${n}"${String(v) === String(n) ? " checked" : ""}${dis}><span>${n}</span></label>`).join("")}</div>
        ${c.min_label || c.max_label ? `<div class="fx-ends"><span>${esc(c.min_label || "")}</span><span>${esc(c.max_label || "")}</span></div>` : ""}</div>`;
    }
    case "consent": return `<label class="fx-opt fx-consent"><input type="checkbox" id="${id}"${nm}${desc} value="yes"${v === "yes" ? " checked" : ""}${dis}><span><b>${esc(q.label || say("agree", en))}</b>${reqTag}${q.help ? `<span class="fx-help fx-chelp">${esc(q.help).replace(/\n/g, "<br>")}</span>` : ""}</span></label>`;
    case "file": {
      const k = FILE_KINDS[c.accept] || FILE_KINDS.any;
      const accept = k.mime.concat(k.ext.map(e => "." + e)).join(",");
      return `<div class="fx-file" data-fxfile="${esc(q.id)}">
        ${v ? `<p class="fx-done">${o.fileName ? `${esc(say("uploaded", en))}<b>${esc(o.fileName)}</b>` : esc(say("uploadedOne", en))}</p>` : ""}
        <label class="fx-pick${o.uploading ? " busy" : ""}"><input type="file" id="${id}" data-fxup="${esc(q.id)}" accept="${esc(accept)}"${desc}${dis || (o.uploading ? " disabled" : "")}><span>${esc(o.uploading ? say("uploading", en) : v ? say("replace", en) : say("upload", en))}</span></label>
        <p class="fx-help">${esc(say("fileHint", en, { n: c.max_mb, t: en ? k.en : k.zh }))}</p></div>`;
    }
    default: return `<input id="${id}"${nm}${desc}${ph}${dis} type="text" value="${esc(v)}" maxlength="${Math.min(num(c.max_len) || DEFAULT_MAX.short, DEFAULT_MAX.short)}">`;
  }
}

// 進度條：只有一頁以上才畫。數字是「這一頁在這條路上排第幾」，路徑會跟著答案變（有跳頁的時候總頁數會變）。
export function progressHTML(step, total, en) {
  if (!total || total < 2) return "";
  const pct = Math.round(step / total * 100);
  return `<div class="fx-prog" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${step}" aria-label="${esc(say("step", en, { i: step, n: total }))}">
    <div class="fx-bar"><i style="width:${pct}%"></i></div><span>${esc(say("step", en, { i: step, n: total }))}</span></div>`;
}

// 從畫面上讀一題的答案。root 是包著整份表單的那一個元素。
export function readValue(root, rawQ) {
  const q = N(rawQ);
  const sel = `[data-fxq="${cssq(q.id)}"]`;
  if (q.type === "multi" || q.type === "single") {
    const picked = [...root.querySelectorAll(sel + ":checked")].map(i => i.value);
    const oi = root.querySelector(`[data-fxother="${cssq(q.id)}"]`);
    const list = picked.map(p => p === OTHER ? (oi ? oi.value.trim() : "") : p).filter(x => x !== "" || picked.includes(OTHER));
    // 選了「其他」卻還沒寫字：記成 OTHER，畫面才留得住那個圓點，驗證也說得出「寫一下是什麼」。
    if (q.type === "single") return picked[0] === OTHER && !list[0] ? OTHER : (list.length ? list[0] : "");
    return list;
  }
  if (q.type === "scale") { const el = root.querySelector(sel + ":checked"); return el ? el.value : ""; }
  if (q.type === "consent") { const el = root.querySelector(sel); return el && el.checked ? "yes" : ""; }
  if (q.type === "file") return null;   // 檔案的值是上傳完的路徑，由 runner 記著，不從畫面讀
  const el = root.querySelector(sel);
  return el ? el.value : "";
}
const cssq = s => String(s).replace(/["\\]/g, "\\$&");

// ── 10. 樣式 ──────────────────────────────────────────────────────────
// 引擎畫的東西自己帶樣式（shared/ 只多這一支，不另開 css 檔）。只用 shared/brand.css 的 token。
// 每一頁第一次畫表單時叫 ensureStyle() 塞一次 <style id="fx-style">。
export const CSS = `
.fx-form{max-width:40em}
.fx-q{margin:0 0 28px}
.fx-q[hidden]{display:none}
.fx-label{display:block;font-weight:600;font-size:16.5px;line-height:1.5;margin:0 0 4px;color:var(--ink)}
.fx-n{color:rgba(16,42,134,.6);font-weight:600}
.fx-req{color:rgba(16,42,134,.72);font-weight:600;font-size:13.5px;white-space:nowrap}
.fx-help{font-size:13.5px;line-height:1.6;color:rgba(16,42,134,.8);margin:0 0 9px}
.fx-h{font-family:var(--display);font-weight:700;font-size:clamp(20px,2vw,26px);margin:8px 0 4px;color:var(--ink)}
.fx-lead{font-size:16px;line-height:1.7;margin:0 0 6px}
.fx-q input[type=text],.fx-q input[type=email],.fx-q input[type=tel],.fx-q input[type=date],.fx-q textarea,.fx-q select{
  width:100%;font-family:var(--body);font-size:16px;color:var(--ink);padding:12px 14px;
  border:1px solid rgba(16,42,134,.28);border-radius:12px;background:rgba(255,255,255,.75);
  transition:border-color var(--dur-2) var(--ease),background var(--dur-2) var(--ease)}
.fx-q select{appearance:auto}
.fx-q textarea{min-height:130px;line-height:1.65;resize:vertical}
.fx-q input:hover,.fx-q textarea:hover,.fx-q select:hover{border-color:rgba(16,42,134,.5)}
.fx-q input:focus-visible,.fx-q textarea:focus-visible,.fx-q select:focus-visible{outline:var(--ring);outline-offset:var(--ring-gap);background:rgba(255,255,255,.95)}
.fx-bad input[type=text],.fx-bad input[type=email],.fx-bad input[type=tel],.fx-bad input[type=date],.fx-bad textarea,.fx-bad select{border-color:var(--bt-navy);border-width:2px}
.fx-err{font-size:14px;font-weight:600;color:var(--ink);margin:8px 0 0;padding:6px 10px;border-left:3px solid var(--bt-orange);background:rgba(255,196,108,.22);border-radius:0 8px 8px 0}
.fx-err[hidden]{display:none}
.fx-opts{display:flex;flex-direction:column;gap:6px}
.fx-opt{display:flex;gap:11px;align-items:flex-start;padding:10px 12px;cursor:pointer;font-size:16px;line-height:1.5;
  border:1px solid rgba(16,42,134,.16);border-radius:12px;background:rgba(255,255,255,.5);transition:border-color var(--dur-2) var(--ease),background var(--dur-2) var(--ease)}
.fx-opt:hover{border-color:rgba(16,42,134,.42)}
.fx-opt:has(input:checked){border-color:var(--bt-navy);background:rgba(255,255,255,.92)}
.fx-opt input[type=radio],.fx-opt input[type=checkbox]{width:19px;height:19px;flex:none;margin:2px 0 0;accent-color:var(--bt-navy);cursor:pointer}
.fx-opt:active{background:rgba(255,196,108,.26)}
.fx-other{flex-wrap:wrap;align-items:center}
.fx-other .fx-other-in{flex:1 1 12em;min-width:0;width:auto;padding:6px 10px;font-size:15px;margin:0}
.fx-consent{align-items:flex-start}
.fx-consent b{font-weight:600}
.fx-chelp{display:block;margin:4px 0 0}
.fx-scale{max-width:34em}
.fx-nums{display:flex;flex-wrap:wrap;gap:6px}
.fx-num{position:relative;flex:1 1 40px;min-width:40px;max-width:64px}
.fx-num input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
.fx-num span{display:flex;align-items:center;justify-content:center;height:44px;border:1px solid rgba(16,42,134,.28);border-radius:10px;
  font-family:var(--display);font-weight:700;font-size:17px;background:rgba(255,255,255,.6);transition:background var(--dur-2) var(--ease),color var(--dur-2) var(--ease)}
.fx-num:hover span{border-color:var(--bt-navy)}
.fx-num input:checked+span{background:var(--bt-navy);color:var(--bt-cream);border-color:var(--bt-navy)}
.fx-num input:focus-visible+span{outline:var(--ring);outline-offset:var(--ring-gap)}
.fx-ends{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:rgba(16,42,134,.75);margin-top:6px}
.fx-file .fx-pick{display:inline-flex;align-items:center;position:relative;border:1px dashed rgba(16,42,134,.45);border-radius:12px;padding:12px 18px;cursor:pointer;font-weight:600;background:rgba(255,255,255,.6)}
.fx-file .fx-pick:hover{border-color:var(--bt-navy);background:rgba(255,255,255,.9)}
.fx-file .fx-pick input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}
.fx-file .fx-pick.busy{opacity:.6}
.fx-file .fx-done{margin:0 0 8px;font-size:15px}
.fx-file .fx-help{margin-top:8px}
.fx-prog{display:flex;align-items:center;gap:12px;margin:0 0 22px;font-size:13px;color:rgba(16,42,134,.8)}
.fx-bar{flex:1;height:6px;border-radius:999px;background:rgba(16,42,134,.12);overflow:hidden}
.fx-bar i{display:block;height:100%;background:var(--bt-navy);border-radius:999px}
.fx-ptitle{font-family:var(--display);font-weight:700;font-size:clamp(21px,2.2vw,28px);margin:0 0 14px}
.fx-nav{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:8px}
.fx-sum{font-size:15px;font-weight:600;padding:12px 14px;border-radius:12px;background:rgba(255,196,108,.3);margin:0 0 18px}
.fx-draft{font-size:13px;color:rgba(16,42,134,.75);margin:18px 0 0}
.fx-draft button{background:none;border:0;padding:0;font:inherit;font-weight:600;color:var(--ink);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.fx-pv{font-size:13.5px;padding:10px 12px;border-radius:10px;background:rgba(107,198,187,.28);margin:0 0 18px}
@media (prefers-reduced-motion:reduce){.fx-q *,.fx-opt,.fx-num span{transition:none!important}}
`;
export function ensureStyle(doc) {
  const d = doc || (typeof document !== "undefined" ? document : null);
  if (!d || d.getElementById("fx-style")) return;
  const s = d.createElement("style"); s.id = "fx-style"; s.textContent = CSS + EDITOR_CSS; d.head.appendChild(s);
}

// 一頁表單的 HTML（runner 每次重畫都叫這一支；對外那一頁第一次畫也可以直接叫，測試也是）。
// ev 是 evaluate() 的結果；st：{ answers, page, errs, busy, summary, uploading }；o 是 mount 的 opts。
// o.bottomHTML 只畫在最後一頁送出鈕上面（例如家長 email），可以是字串或回字串的函式。
export function pageHTML(e, st, o) {
  o = o || {}; st = Object.assign({ answers: {}, page: 0, errs: {}, uploading: {}, names: {} }, st || {});
  const pg = e.pages[st.page] || e.pages[0];
  const step = Math.max(1, e.path.indexOf(st.page) + 1), total = e.path.length;
  const last = step >= total;
  const body = pg.items.map(it => {
    const h = questionHTML(it, st.answers[it.id], { en: o.en, err: st.errs[it.id], required: e.required.has(it.id), disabled: o.disabled, uploading: st.uploading[it.id], fileName: st.names[it.id] });
    return e.hidden.has(it.id) ? h.replace(/^<div class="fx-q/, '<div hidden class="fx-q') : h;
  }).join("");
  const bottom = typeof o.bottomHTML === "function" ? o.bottomHTML() : (o.bottomHTML || "");
  return `<div class="fx-form" data-fxform>
      ${o.preview ? `<p class="fx-pv">${esc(say("preview", o.en))}</p>` : ""}
      ${o.topHTML || ""}
      ${progressHTML(step, total, o.en)}
      ${pg.title && (st.page > 0 || total > 1) ? `<h3 class="fx-ptitle">${esc(pg.title)}</h3>` : ""}
      ${st.summary ? `<p class="fx-sum" role="alert">${esc(st.summary)}</p>` : ""}
      ${body}
      ${last && !o.disabled ? bottom : ""}
      ${o.disabled ? "" : `<div class="fx-nav">
        ${step > 1 ? `<button type="button" class="btn ghost" data-fxnav="back">${esc(say("back", o.en))}</button>` : ""}
        ${last ? `<button type="button" class="btn" data-fxnav="submit"${st.busy ? " disabled" : ""}>${esc(st.busy ? say("sending", o.en) : (o.submitLabel || say("submit", o.en)))}</button>`
               : `<button type="button" class="btn" data-fxnav="next">${esc(say("next", o.en))}</button>`}
      </div>`}
      ${o.showDraftNote && o.draftKey && !o.disabled ? `<p class="fx-draft">${esc(say("draftKept", o.en))} <button type="button" data-fxnav="clear">${esc(say("draftClear", o.en))}</button></p>` : ""}
    </div>`;
}
// 不能填的時候（沒登入、資料沒填齊、送過了）：整份攤開給人看過，每一格鎖住。換頁的標題當小標題印。
export function flatHTML(rawItems, en) {
  const e = evaluate(rawItems, {});
  return `<div class="fx-form">${e.pages.map((p, i) => (p.title && (i > 0 || e.pages.length > 1) ? `<h3 class="fx-ptitle">${esc(p.title)}</h3>` : "")
    + p.items.map(it => questionHTML(it, "", { en, disabled: true, required: it.required })).join("")).join("")}</div>`;
}

// ── 11. runner：一頁一頁填的表單 ──────────────────────────────────────
// mount(el, items, opts) 在 el 裡畫出整份表單，自己管答案、頁數、驗證、條件邏輯。
// opts：{ en, answers, page, disabled, preview, draftKey, onSubmit(payload, ev, answers), onUpload(q, file) → 路徑,
//         submitLabel, busy, topHTML, showDraftNote }
// 回一個物件：{ answers(), render(), setBusy(b), setError(id, msg), clearDraft() }。
// **重畫外面那一頁的時候再 mount 一次就好**：答案跟頁數在傳進來的 opts.answers / page，外面那一頁自己記著。
export function mount(el, rawItems, opts) {
  const o = Object.assign({}, opts || {});
  const items = rawItems.map(normalize);
  // names：學生自己選的檔名，只留在這個畫面上給他看（上傳的路徑不帶原本的檔名，那常常是全名）。
  const st = { answers: Object.assign({}, o.answers || {}), page: o.page || 0, errs: {}, busy: !!o.busy, uploading: {}, names: {}, summary: "" };
  if (st.page && !pages(items)[st.page]) st.page = 0;
  ensureStyle(el.ownerDocument);
  const ev = () => evaluate(items, st.answers);
  const keep = () => { if (o.draftKey) draftSave(o.draftKey, st.answers, st.page, o.meta); if (o.onChange) o.onChange(st.answers, st.page); };

  function render() {
    const e = ev();
    if (!e.path.includes(st.page)) st.page = e.path.filter(i => i <= st.page).pop() || 0;
    el.innerHTML = pageHTML(e, st, o);
  }
  // 打字或勾選：答案存起來，重算哪些題看得到，只動 hidden 與必填記號（**不整頁重畫**，不然打到一半的那一格會失去游標）。
  function refresh() {
    const e = ev();
    for (const it of e.items) {
      const node = el.querySelector(`[data-fx="${cssq(it.id)}"]`);
      if (!node) continue;
      node.hidden = e.hidden.has(it.id);
      const tag = node.querySelector(".fx-req"), req = e.required.has(it.id);
      if (req && !tag && isInput(it) && it.type !== "consent") { const l = node.querySelector(".fx-label"); if (l) l.insertAdjacentHTML("beforeend", ` <span class="fx-req">*${o.en ? "required" : "必填"}</span>`); }
      if (!req && tag && !it.required) tag.remove();
    }
    const step = e.path.indexOf(st.page) + 1, total = e.path.length;
    const prog = el.querySelector(".fx-prog");
    if (prog) prog.outerHTML = progressHTML(step, total, o.en);
    // 跳頁規則讓「下一頁」變成「送出」（或反過來）的時候，按鈕要跟著換。
    const nav = el.querySelector('[data-fxnav="next"],[data-fxnav="submit"]');
    if (nav && (nav.dataset.fxnav === "submit") !== (step >= total)) render();
  }
  function readPage() {
    const e = ev();
    for (const it of (e.pages[st.page] || { items: [] }).items) {
      if (!isInput(it) || it.type === "file") continue;
      st.answers[it.id] = readValue(el, it);
    }
  }
  function onInput(evt) {
    const t = evt.target;
    const qid = t.dataset.fxq || t.dataset.fxother;
    if (!qid) return;
    const it = items.find(x => x.id === qid);
    if (!it) return;
    if (t.dataset.fxother && t.value && (it.type === "single" || it.type === "multi")) {
      const r = el.querySelector(`[data-fxq="${cssq(qid)}"][value="${OTHER}"]`); if (r) r.checked = true;
    }
    st.answers[qid] = readValue(el, it);
    if (st.errs[qid]) { const m = validate(it, st.answers[qid], o.en, ev().required.has(qid)); if (!m) { delete st.errs[qid]; const node = el.querySelector(`[data-fx="${cssq(qid)}"]`); if (node) { node.classList.remove("fx-bad"); const er = node.querySelector(".fx-err"); if (er) er.hidden = true; } } }
    // 錯的題都改好了，上面那句「有 N 題要再看一下」也跟著拿掉，不用等到再按一次下一頁。
    if (st.summary && !Object.keys(st.errs).length) { st.summary = ""; const sm = el.querySelector(".fx-sum"); if (sm) sm.remove(); }
    keep(); refresh();
  }
  async function onFile(evt) {
    const t = evt.target; const qid = t.dataset.fxup; if (!qid) return;
    const it = items.find(x => x.id === qid); const f = t.files && t.files[0]; if (!it || !f) return;
    const bad = fileProblem(it, f, o.en);
    if (bad) { st.errs[qid] = bad; render(); return; }
    if (!o.onUpload) return;
    readPage();
    st.uploading[qid] = true; delete st.errs[qid]; render();
    try { st.answers[qid] = await o.onUpload(it, f); st.names[qid] = f.name; keep(); }
    catch (err) { st.errs[qid] = String((err && err.message) || err); }
    delete st.uploading[qid]; render();
  }
  async function onClick(evt) {
    const b = evt.target.closest("[data-fxnav]"); if (!b || !el.contains(b)) return;
    const act = b.dataset.fxnav;
    if (act === "clear") { draftClear(o.draftKey); st.answers = {}; st.page = 0; st.errs = {}; render(); if (o.onChange) o.onChange(st.answers, 0); return; }
    readPage();
    const e = ev();
    if (act === "back") { const i = e.path.indexOf(st.page); st.page = i > 0 ? e.path[i - 1] : 0; st.errs = {}; st.summary = ""; keep(); render(); top(); return; }
    const errs = validateAll(e, st.answers, o.en, act === "submit" ? null : st.page);
    st.errs = errs;
    const nErr = Object.keys(errs).length;
    if (nErr) {
      // 送出時錯的題可能在前面幾頁：跳回第一個有錯的那一頁。
      const firstPage = Math.min(...Object.keys(errs).map(id => e.pageOf[id]));
      if (firstPage !== st.page) st.page = firstPage;
      st.summary = nErr > 1 ? say("fix", o.en, { n: nErr }) : "";
      render();
      const bad = el.querySelector(".fx-bad input, .fx-bad textarea, .fx-bad select");
      if (bad && bad.focus) bad.focus();
      return;
    }
    st.summary = "";
    if (act === "next") { const i = e.path.indexOf(st.page); st.page = e.path[i + 1] != null ? e.path[i + 1] : st.page; keep(); render(); top(); return; }
    if (act === "submit" && o.onSubmit) await o.onSubmit(collect(e, st.answers), e, st.answers);
  }
  const top = () => { try { el.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (x) { /* 舊瀏覽器 */ } };
  if (el._fxOff) el._fxOff();
  el.addEventListener("input", onInput); el.addEventListener("change", onInput); el.addEventListener("change", onFile); el.addEventListener("click", onClick);
  el._fxOff = () => { el.removeEventListener("input", onInput); el.removeEventListener("change", onInput); el.removeEventListener("change", onFile); el.removeEventListener("click", onClick); };
  render();
  return {
    answers: () => st.answers, page: () => st.page, render,
    setBusy(b) { st.busy = !!b; render(); },
    setErrors(map, summary) { st.errs = map || {}; st.summary = summary || ""; render(); },
    clearDraft() { draftClear(o.draftKey); },
  };
}

// ── 12. 編輯器：一塊一題，像 Tally 那樣直接在畫布上改 ─────────────────
// 三個後台各自把這一塊包進自己的 data-autosave 容器裡（存的方法各自不同）。這裡只負責畫與讀。
// opts：{ en, canEdit, types（這一套收得了的題型）, index, count, locked（有人填過，不能換題型、不能刪）, act（存檔那一顆的代號，預設 q-save）}
const E = {
  label: ["題目", "Question"], labelPh: ["打題目，例如：你為什麼想參加？", "Type a question, e.g. Why do you want to join?"],
  headPh: ["小標題", "Heading"], textPh: ["一段給申請人看的說明", "Some text for the applicant"], pagePh: ["這一頁的標題（選填）", "Page title (optional)"],
  help: ["說明（選填）", "Description (optional)"], type: ["題型", "Type"], req: ["必填", "Required"],
  opts: ["選項，一行一個", "Options, one per line"], other: ["多一個「其他」可以自己寫", "Add an \"Other\" option with free text"],
  up: ["往上移", "Move up"], down: ["往下移", "Move down"], dup: ["複製", "Duplicate"], del: ["刪掉", "Delete"], drag: ["拖曳排序", "Drag to reorder"],
  logic: ["條件邏輯", "Logic"], adv: ["進階", "Advanced"], key: ["網址帶入用的代號（英文）", "Prefill key (letters)"],
  keyHint: ["填了之後，連結加上 ?q_{k}=值 就會先幫人填好這一題。", "With a key, a link ending in ?q_{k}=value fills this answer in."],
  ph: ["格子裡的提示字", "Placeholder"], minLen: ["最少幾個字", "Min characters"], maxLen: ["最多幾個字", "Max characters"],
  min: ["最小", "Min"], max: ["最大", "Max"], smin: ["從", "From"], smax: ["到", "To"], lmin: ["最小那一端的字", "Label at the low end"], lmax: ["最大那一端的字", "Label at the high end"],
  accept: ["收哪種檔案", "File types"], maxMb: ["最大幾 MB", "Max size (MB)"],
  when: ["當", "When"], all: ["全部成立", "all"], any: ["任一個成立", "any"], of: ["下面這些條件", "of these are true"],
  then: ["就", "then"], show: ["顯示", "show"], hide: ["藏起來", "hide"], require: ["變成必填", "require"], jump: ["跳到", "jump to"],
  addCond: ["＋ 再加一個條件", "+ Add condition"], addRule: ["＋ 加一條規則", "+ Add a rule"], delRule: ["拿掉這條", "Remove rule"], delCond: ["拿掉", "Remove"],
  end: ["直接到最後送出", "the end (submit)"], pageN: ["第 {n} 頁", "Page {n}"], noRules: ["還沒有規則。例如：「當這一題是『其他』，就顯示下一題」。", "No rules yet. For example: when this answer is Other, show the next question."],
  broken: ["這條規則指到的題目或頁已經不在了，它現在不會作用。", "This rule points at a question or page that is gone, so it does nothing."],
  thisQ: ["（這一題）", "(this question)"], value: ["值", "value"], self: ["這一題", "this question"],
  insert: ["＋ 加一題", "+ Add a block"], slash: ["打 / 選題型，或按這裡", "Type / to pick a block, or click"], menu: ["要加哪一種？", "Which block?"],
  locked: ["有人填過了，題型不能換、這一題不能刪（改字可以）。", "Someone has answered, so the type is fixed and it cannot be deleted (wording can change)."],
  edit: ["編輯", "Edit"], preview: ["預覽", "Preview"],
  untitled: ["沒有題目的題", "Untitled"],
};
const t = (k, en, v) => fill((E[k] || [k, k])[en ? 1 : 0], v);
export const ed = t;

// 「加一題」那一排選單。filter 是打在 / 後面的字（中英都比對）。
export function insertMenuHTML(types, at, en, filter) {
  const f = low(filter || "");
  const list = TYPES.filter(x => (types || ALL_TYPES).includes(x.v)).filter(x => !f || low(x.zh).includes(f) || low(x.en).includes(f) || x.v.includes(f));
  return `<div class="fx-menu" role="menu" aria-label="${esc(t("menu", en))}">${list.map(x => `<button type="button" role="menuitem" class="fx-mi" data-act="fx-insert" data-type="${x.v}" data-at="${at}">${esc(en ? x.en : x.zh)}</button>`).join("") || `<span class="mini">—</span>`}</div>`;
}
// 每兩塊之間那一條細細的「＋」。open 是那一條的選單開著。
export function gapHTML(at, en, open, types, filter) {
  return `<div class="fx-gap${open ? " open" : ""}"><button type="button" class="fx-plus" data-act="fx-menu" data-at="${at}" aria-label="${esc(t("insert", en))}" aria-expanded="${open ? "true" : "false"}">＋</button>${open ? insertMenuHTML(types, at, en, filter) : ""}</div>`;
}
// 一條規則的條件那一格要用什麼：有選項的題用下拉（是其中之一用勾選），其他用打字。
function condValueHTML(w, src, en, name, dis) {
  const op = OPS_BY[w.op] || OPS[0];
  if (!op.needs) return "";
  const opts = src ? src.options.concat(src.config.other ? [OTHER] : []) : [];
  const show = v => v === OTHER ? say("other", en) : v;
  if (src && opts.length && op.many) {
    const have = Array.isArray(w.v) ? w.v : String(w.v || "").split(/[,，、\n]/).map(s => s.trim()).filter(Boolean);
    return `<span class="fx-cvs">${opts.map(x => `<label class="fx-cv"><input type="checkbox" name="${name}" value="${esc(x)}"${have.includes(x) ? " checked" : ""}${dis}><span>${esc(show(x))}</span></label>`).join("")}</span>`;
  }
  if (src && opts.length && !op.numeric && op.v !== "contains") return `<select name="${name}"${dis}><option value=""></option>${opts.map(x => `<option value="${esc(x)}"${String(w.v) === x ? " selected" : ""}>${esc(show(x))}</option>`).join("")}</select>`;
  if (src && src.type === "scale" && op.numeric) { const nums = []; for (let n = src.config.scale_min; n <= src.config.scale_max; n++) nums.push(n); return `<select name="${name}"${dis}>${nums.map(n => `<option${String(w.v) === String(n) ? " selected" : ""}>${n}</option>`).join("")}</select>`; }
  return `<input name="${name}" value="${esc(Array.isArray(w.v) ? w.v.join(", ") : w.v)}" placeholder="${esc(t("value", en))}"${op.numeric ? ' inputmode="decimal"' : ""}${dis}>`;
}
export function logicHTML(rawQ, rawItems, en, canEdit, open) {
  const q = N(rawQ), items = rawItems.map(N);
  const dis = canEdit ? "" : " disabled";
  const inputs = items.filter(isInput);
  const pg = pages(items);
  const myPage = pg.findIndex(p => p.items.some(i => i.id === q.id));
  const broken = new Set(brokenRules(items).filter(b => b.owner === q.id).map(b => b.rule));
  const targets = items.filter(i => i.type !== "page" && i.id !== q.id);
  const rules = q.logic.map((r, ri) => `<div class="fx-rule" data-rule="${ri}">
    ${broken.has(ri) ? `<p class="fx-warn">${esc(t("broken", en))}</p>` : ""}
    <div class="fx-rrow"><b>${esc(t("when", en))}</b>
      <select name="lg-${ri}-match"${dis}><option value="all"${r.match === "all" ? " selected" : ""}>${esc(t("all", en))}</option><option value="any"${r.match === "any" ? " selected" : ""}>${esc(t("any", en))}</option></select>
      <span>${esc(t("of", en))}</span></div>
    ${r.when.map((w, ci) => { const src = items.find(i => i.id === w.q); return `<div class="fx-cond" data-cond="${ci}">
      <select name="lg-${ri}-c${ci}-q" data-fx-redraw="1"${dis}>${inputs.map(i => `<option value="${esc(i.id)}"${i.id === w.q ? " selected" : ""}>${esc(short(i.label) || t("untitled", en))}${i.id === q.id ? " " + esc(t("thisQ", en)) : ""}</option>`).join("")}</select>
      <select name="lg-${ri}-c${ci}-op" data-fx-redraw="1"${dis}>${OPS.filter(o => !o.numeric || !src || ["number", "scale"].includes(src.type)).map(o => `<option value="${o.v}"${o.v === w.op ? " selected" : ""}>${esc(en ? o.en : o.zh)}</option>`).join("")}</select>
      ${condValueHTML(w, src, en, `lg-${ri}-c${ci}-v`, dis)}
      ${canEdit && r.when.length > 1 ? `<button type="button" class="fx-x" data-act="fx-del-cond" data-id="${esc(q.id)}" data-rule="${ri}" data-cond="${ci}">${esc(t("delCond", en))}</button>` : ""}
    </div>`; }).join("")}
    ${canEdit ? `<button type="button" class="fx-link" data-act="fx-add-cond" data-id="${esc(q.id)}" data-rule="${ri}">${esc(t("addCond", en))}</button>` : ""}
    <div class="fx-rrow"><b>${esc(t("then", en))}</b>
      <select name="lg-${ri}-do" data-fx-redraw="1"${dis}>${["show", "hide", "require", "jump"].map(d => `<option value="${d}"${r.do === d ? " selected" : ""}>${esc(t(d, en))}</option>`).join("")}</select>
      ${r.do === "jump"
        ? `<select name="lg-${ri}-target"${dis}>${pg.map((p, i) => i > myPage ? `<option value="${esc(p.id)}"${p.id === r.target ? " selected" : ""}>${esc(t("pageN", en, { n: i + 1 }))}${p.title ? "：" + esc(short(p.title)) : ""}</option>` : "").join("")}<option value="end"${r.target === "end" ? " selected" : ""}>${esc(t("end", en))}</option></select>`
        : `<select name="lg-${ri}-target"${dis}>${targets.map(i => `<option value="${esc(i.id)}"${i.id === r.target ? " selected" : ""}>${esc(short(i.label) || t("untitled", en))}</option>`).join("")}</select>`}
      ${canEdit ? `<button type="button" class="fx-x" data-act="fx-del-rule" data-id="${esc(q.id)}" data-rule="${ri}">${esc(t("delRule", en))}</button>` : ""}
    </div></div>`).join("");
  return `<details class="fx-logic"${open || q.logic.length && open !== false ? " open" : ""}><summary>${esc(t("logic", en))}${q.logic.length ? ` <span class="fx-badge">${q.logic.length}</span>` : ""}</summary>
    <div class="fx-lbody">${rules || `<p class="mini">${esc(t("noRules", en))}</p>`}
    ${canEdit ? `<button type="button" class="fx-link" data-act="fx-add-rule" data-id="${esc(q.id)}">${esc(t("addRule", en))}</button>` : ""}</div></details>`;
}
const short = s => { const a = [...String(s || "").replace(/\s+/g, " ").trim()]; return a.length > 36 ? a.slice(0, 35).join("") + "…" : a.join(""); };

export function blockHTML(rawQ, rawItems, opts) {
  const q = normalize(rawQ), o = opts || {}, en = !!o.en, c = q.config;
  const dis = o.canEdit ? "" : " disabled";
  const act = o.act || "q-save";
  const types = (o.types || ALL_TYPES).filter(v => TYPE[v]);
  const head = q.type === "heading", txt = q.type === "text", pgb = q.type === "page";
  const lockType = o.locked ? " disabled" : dis;
  const num2 = (name, label, val, extra) => `<label class="fx-f"><i>${esc(label)}</i><input name="${name}" inputmode="numeric" value="${esc(val == null ? "" : val)}"${extra || ""}${dis}></label>`;
  let extra = "";
  if (isChoice(q)) extra = `<label class="fx-f fx-wide"><i>${esc(t("opts", en))}</i><textarea name="options" rows="${Math.max(3, q.options.length + 1)}"${dis}>${esc(q.options.join("\n"))}</textarea></label>
    ${q.type !== "dropdown" ? `<label class="fx-chk"><input type="checkbox" name="other"${c.other ? " checked" : ""}${dis}><span>${esc(t("other", en))}</span></label>` : ""}`;
  else if (q.type === "short" || q.type === "long") extra = `<div class="fx-row">${num2("min_len", t("minLen", en), c.min_len)}${num2("max_len", t("maxLen", en), c.max_len, ` placeholder="${DEFAULT_MAX[q.type]}"`)}</div>`;
  else if (q.type === "number") extra = `<div class="fx-row">${num2("min", t("min", en), c.min)}${num2("max", t("max", en), c.max)}</div>`;
  else if (q.type === "scale") extra = `<div class="fx-row">${num2("scale_min", t("smin", en), c.scale_min)}${num2("scale_max", t("smax", en), c.scale_max)}</div>
    <div class="fx-row"><label class="fx-f"><i>${esc(t("lmin", en))}</i><input name="min_label" value="${esc(c.min_label || "")}"${dis}></label><label class="fx-f"><i>${esc(t("lmax", en))}</i><input name="max_label" value="${esc(c.max_label || "")}"${dis}></label></div>`;
  else if (q.type === "file") extra = `<div class="fx-row"><label class="fx-f"><i>${esc(t("accept", en))}</i><select name="accept"${dis}>${Object.entries(FILE_KINDS).map(([k, v]) => `<option value="${k}"${c.accept === k ? " selected" : ""}>${esc(en ? v.en : v.zh)}</option>`).join("")}</select></label>${num2("max_mb", t("maxMb", en), c.max_mb, ` placeholder="${FILE_MAX_MB}"`)}</div>`;
  const adv = isInput(q) && q.type !== "file" ? `<details class="fx-adv"><summary>${esc(t("adv", en))}</summary>
    ${["short", "long", "email", "phone", "number"].includes(q.type) ? `<label class="fx-f"><i>${esc(t("ph", en))}</i><input name="placeholder" value="${esc(c.placeholder || "")}"${dis}></label>` : ""}
    ${q.type !== "consent" && o.prefill !== false ? `<label class="fx-f"><i>${esc(t("key", en))}</i><input name="key" value="${esc(q.key)}" spellcheck="false" autocomplete="off" maxlength="40"${dis}></label>
    <p class="mini">${esc(t("keyHint", en, { k: q.key || "school" }))}</p>` : ""}</details>` : "";
  const tools = o.canEdit ? `<div class="fx-tools">
      <span class="fx-grip" draggable="true" data-fx-drag="${esc(q.id)}" title="${esc(t("drag", en))}" aria-hidden="true">⋮⋮</span>
      <button type="button" class="fx-tb" data-act="fx-up" data-id="${esc(q.id)}" aria-label="${esc(t("up", en))}"${o.index === 0 ? " disabled" : ""}>↑</button>
      <button type="button" class="fx-tb" data-act="fx-down" data-id="${esc(q.id)}" aria-label="${esc(t("down", en))}"${o.index === (o.count || 1) - 1 ? " disabled" : ""}>↓</button>
      <button type="button" class="fx-tb" data-act="fx-dup" data-id="${esc(q.id)}">${esc(t("dup", en))}</button>
      ${o.locked ? "" : `<button type="button" class="fx-tb" data-act="fx-del" data-id="${esc(q.id)}">${esc(t("del", en))}</button>`}
    </div>` : "";
  return `<div class="fx-blk${pgb ? " fx-pgb" : ""}${head || txt ? " fx-deco" : ""}" data-autosave="${esc(act)}" data-id="${esc(q.id)}" data-fx-blk="${esc(q.id)}">
    <div class="fx-btop">
      <select name="type" class="fx-type" aria-label="${esc(t("type", en))}" data-fx-redraw="1"${lockType}>${types.map(v => `<option value="${v}"${v === q.type ? " selected" : ""}>${esc(typeLabel(v, en))}</option>`).join("")}</select>
      ${isInput(q) && q.type !== "consent" || q.type === "consent" ? `<label class="fx-chk fx-reqt"><input type="checkbox" name="required"${q.required ? " checked" : ""}${dis}><span>${esc(t("req", en))}</span></label>` : ""}
      <span class="fx-sp"></span>${o.saveHint || ""}${tools}
    </div>
    ${o.locked && o.canEdit ? `<p class="mini">${esc(t("locked", en))}</p>` : ""}
    ${txt ? `<textarea name="label" class="fx-ltxt" rows="3" placeholder="${esc(t("textPh", en))}"${dis}>${esc(q.label)}</textarea>`
          : `<input name="label" class="fx-ltitle${head || pgb ? " fx-lhead" : ""}" value="${esc(q.label)}" placeholder="${esc(head ? t("headPh", en) : pgb ? t("pagePh", en) : t("labelPh", en))}" aria-label="${esc(t("label", en))}"${dis}>`}
    ${pgb ? "" : `<input name="help" class="fx-lhelp" value="${esc(q.help)}" placeholder="${esc(t("help", en))}" aria-label="${esc(t("help", en))}"${dis}>`}
    ${extra}${adv}
    ${isInput(q) || (q.logic && q.logic.length) ? logicHTML(q, rawItems, en, o.canEdit, o.logicOpen) : ""}
  </div>`;
}

// 整塊畫布：每一題一塊，塊與塊之間一條「＋」，最底下一格「打 / 選題型」。
// opts 同上，再多：{ menuAt（哪一條「＋」開著）, filter（/ 後面打的字）, lockedIds（Set，有人填過的題）, logicOpen（Set） }
export function canvasHTML(rawItems, opts) {
  const o = opts || {}, en = !!o.en;
  const items = rawItems.map(normalize);
  const n = items.length;
  const blocks = items.map((q, i) => (o.canEdit ? gapHTML(i, en, o.menuAt === i, o.types, o.filter) : "")
    + blockHTML(q, items, Object.assign({}, o, { index: i, count: n, locked: o.lockedIds && o.lockedIds.has(q.id), logicOpen: o.logicOpen && o.logicOpen.has(q.id) ? true : undefined, saveHint: o.hint ? o.hint(q) : "" }))).join("");
  const tail = o.canEdit ? `<div class="fx-tail">
      <input class="fx-slash" data-fx-slash="1" data-noauto="1" placeholder="${esc(t("slash", en))}" aria-label="${esc(t("insert", en))}" value="${esc(o.menuAt === n ? "/" + (o.filter || "") : "")}">
      <button type="button" class="btn ghost sm" data-act="fx-menu" data-at="${n}">${esc(t("insert", en))}</button>
      ${o.menuAt === n ? insertMenuHTML(o.types, n, en, o.filter) : ""}</div>` : "";
  return `<div class="fx-canvas" data-fx-canvas="1">${blocks}${tail}</div>`;
}

// 從一塊讀回一題（存檔用）。只讀這一塊畫出來的那幾格；沒畫的設定維持原樣（old）。
export function readBlock(box, old) {
  const q = normalize(old || {});
  const v = name => { const el = box.querySelector(`[name="${name}"]`); return el ? (el.type === "checkbox" ? el.checked : String(el.value).trim()) : undefined; };
  const type = v("type") || q.type;
  const out = { id: q.id, key: q.key, type, label: v("label") != null ? v("label") : q.label, help: v("help") != null ? (v("help") || "") : q.help,
    required: v("required") != null ? !!v("required") && !!TYPE[type].input : q.required, options: q.options, config: Object.assign({}, q.config), logic: q.logic };
  const o = v("options"); if (o != null) out.options = o.split("\n").map(s => s.trim()).filter(Boolean);
  for (const k of ["placeholder", "min_label", "max_label", "accept"]) { const x = v(k); if (x != null) { if (x === "") delete out.config[k]; else out.config[k] = x; } }
  for (const k of ["min_len", "max_len", "min", "max", "scale_min", "scale_max", "max_mb"]) { const x = v(k); if (x != null) { if (x === "" || num(x) == null) delete out.config[k]; else out.config[k] = num(x); } }
  const ot = v("other"); if (ot != null) { if (ot) out.config.other = true; else delete out.config.other; }
  const key = v("key"); if (key != null) out.key = key.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  // 換了題型：選項只留給有選項的題，題型專屬的設定清掉（留著的話換回來會冒出沒人記得的舊設定）。
  if (type !== q.type) {
    if (!TYPE[type].choice) out.options = [];
    out.config = {};
    if (TYPE[type].choice && !out.options.length) out.options = [];
  }
  const rules = [...box.querySelectorAll(".fx-rule[data-rule]")];
  if (rules.length || box.querySelector(".fx-logic")) {
    out.logic = rules.map((r, ri) => {
      const g = name => { const el = r.querySelector(`[name="${name}"]`); return el ? el.value : ""; };
      const when = [...r.querySelectorAll(".fx-cond[data-cond]")].map((cEl, ci) => {
        const multi = [...cEl.querySelectorAll(`[name="lg-${ri}-c${ci}-v"][type=checkbox]`)];
        const vEl = cEl.querySelector(`[name="lg-${ri}-c${ci}-v"]`);
        return { q: g(`lg-${ri}-c${ci}-q`), op: g(`lg-${ri}-c${ci}-op`) || "is", v: multi.length ? multi.filter(m => m.checked).map(m => m.value) : (vEl ? vEl.value.trim() : "") };
      });
      return { match: g(`lg-${ri}-match`) || "all", when, do: g(`lg-${ri}-do`) || "show", target: g(`lg-${ri}-target`) };
    });
  }
  return normalize(out);
}

// 邏輯面板上的按鈕（加一條規則、加一個條件、拿掉）：改的是那一題的 logic，回改好的那一題，存檔與重畫交給呼叫的人。
// 新規則預設「當這一題有填，就顯示下一題」，比一條全空的規則好懂。
export function logicAction(act, rawQ, rawItems, ruleIdx, condIdx) {
  const q = normalize(rawQ), items = rawItems.map(normalize);
  const logic = q.logic.map(r => Object.assign({}, r, { when: r.when.map(w => Object.assign({}, w)) }));
  const i = items.findIndex(x => x.id === q.id);
  const next = items.slice(i + 1).find(x => x.type !== "page") || items.find(x => x.id !== q.id && x.type !== "page");
  if (act === "fx-add-rule") logic.push({ match: "all", when: [{ q: isInput(q) ? q.id : (items.find(isInput) || q).id, op: "not_empty", v: "" }], do: "show", target: next ? next.id : "" });
  else if (act === "fx-add-cond" && logic[ruleIdx]) logic[ruleIdx].when.push({ q: q.id, op: "is", v: "" });
  else if (act === "fx-del-rule") logic.splice(ruleIdx, 1);
  else if (act === "fx-del-cond" && logic[ruleIdx]) logic[ruleIdx].when.splice(condIdx, 1);
  return Object.assign({}, q, { logic });
}
// 新的一塊預設長什麼樣。
export function blankBlock(type, en) {
  const label = type === "page" ? "" : type === "heading" ? (en ? "Section" : "一個段落") : type === "text" ? "" : type === "consent" ? (en ? "I agree to the terms above." : "我同意上面的說明。") : "";
  const q = { id: "", type, label, help: "", required: false, options: [], config: {}, logic: [] };
  if (isChoice({ type })) q.options = en ? ["Option 1", "Option 2"] : ["選項一", "選項二"];
  if (type === "scale") q.config = { scale_min: 1, scale_max: 5 };
  if (type === "file") q.config = { accept: "any", max_mb: FILE_MAX_MB };
  return q;
}
// 複製一題：題目後面加「（複本）」，規則不帶過去（帶過去會指到同一題，多半不是人要的）。
export const duplicateOf = (rawQ, en) => { const q = normalize(rawQ); return Object.assign({}, q, { id: "", key: "", label: q.label ? q.label + (en ? " (copy)" : "（複本）") : "", logic: [] }); };
// 拖曳之後的新順序：把 from 那一題放到 to 那一題的位置。回新的 id 順序。
export function moveId(ids, from, to) {
  const a = ids.slice(), i = a.indexOf(from), j = a.indexOf(to);
  if (i < 0 || j < 0 || i === j) return a;
  a.splice(i, 1); a.splice(j, 0, from);
  return a;
}
// 依新順序算出要改 ord 的那幾題（只改真的變了的）。ord 從 1 開始。
export function reorderPatch(items, ids) {
  const out = [];
  ids.forEach((id, i) => { const it = items.find(x => String(x.id) === String(id)); if (it && it.ord !== i + 1) out.push({ id, ord: i + 1 }); });
  return out;
}

// 編輯器的樣式（後台用 admin/admin.css 的外殼，這裡只管畫布本身）。
export const EDITOR_CSS = `
.fx-canvas{max-width:760px}
.fx-blk{position:relative;border:1px solid rgba(16,42,134,.14);border-radius:14px;padding:12px 16px 14px;background:rgba(255,255,255,.62);transition:border-color var(--dur-2) var(--ease),box-shadow var(--dur-2) var(--ease)}
.fx-blk:hover,.fx-blk:focus-within{border-color:rgba(16,42,134,.38);box-shadow:0 6px 20px rgba(16,42,134,.07)}
.fx-blk.fx-pgb{background:rgba(107,198,187,.16);border-style:dashed}
.fx-blk.fx-drop{border-color:var(--bt-navy);border-width:2px}
.fx-btop{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:6px}
.fx-type{font:600 12.5px var(--body);border:1px solid rgba(16,42,134,.22);border-radius:999px;padding:3px 8px;background:rgba(255,255,255,.8);color:var(--ink);width:auto}
.fx-sp{flex:1}
.fx-tools{display:flex;gap:4px;align-items:center}
.fx-tb{border:0;background:none;color:var(--ink);font:600 12.5px var(--body);padding:5px 7px;border-radius:8px;cursor:pointer;opacity:.75}
.fx-tb:hover{opacity:1;background:rgba(16,42,134,.07)}
.fx-tb[disabled]{opacity:.25;cursor:default}
.fx-grip{cursor:grab;opacity:.45;padding:0 4px;letter-spacing:-2px;user-select:none}
.fx-grip:hover{opacity:.9}
.fx-blk input.fx-ltitle,.fx-blk textarea.fx-ltxt{width:100%;border:0;border-bottom:1px solid transparent;background:none;font:600 17px/1.45 var(--body);color:var(--ink);padding:4px 0;border-radius:0}
.fx-blk input.fx-lhead{font-family:var(--display);font-size:21px}
.fx-blk textarea.fx-ltxt{font-weight:400;font-size:15.5px;resize:vertical;min-height:60px}
.fx-blk input.fx-lhelp{width:100%;border:0;border-bottom:1px solid transparent;background:none;font:400 14px var(--body);color:rgba(16,42,134,.8);padding:3px 0;border-radius:0}
.fx-blk input.fx-ltitle:hover,.fx-blk input.fx-lhelp:hover,.fx-blk textarea.fx-ltxt:hover{border-bottom-color:rgba(16,42,134,.2)}
.fx-blk input.fx-ltitle:focus,.fx-blk input.fx-lhelp:focus,.fx-blk textarea.fx-ltxt:focus{outline:none;border-bottom-color:var(--bt-navy)}
.fx-f{display:flex;flex-direction:column;gap:3px;margin:8px 0 0;font-size:13px;min-width:0}
.fx-f i{font-style:normal;color:rgba(16,42,134,.75)}
.fx-f input,.fx-f select,.fx-f textarea{font:400 14.5px var(--body);border:1px solid rgba(16,42,134,.22);border-radius:9px;padding:7px 9px;background:rgba(255,255,255,.85);color:var(--ink);width:100%}
.fx-row{display:flex;flex-wrap:wrap;gap:10px}.fx-row .fx-f{flex:1 1 140px}
.fx-chk{display:inline-flex;gap:7px;align-items:center;font-size:13.5px;cursor:pointer;margin-top:8px}
.fx-reqt{margin-top:0}
.fx-chk input{width:16px;height:16px;accent-color:var(--bt-navy)}
.fx-adv,.fx-logic{margin-top:10px;border-top:1px solid rgba(16,42,134,.1);padding-top:8px}
.fx-adv summary,.fx-logic summary{font:600 13px var(--body);cursor:pointer;color:rgba(16,42,134,.85)}
.fx-badge{display:inline-block;min-width:18px;padding:0 6px;border-radius:999px;background:var(--bt-navy);color:var(--bt-cream);font-size:11.5px;text-align:center}
.fx-lbody{padding-top:6px}
.fx-rule{border:1px solid rgba(16,42,134,.14);border-radius:11px;padding:8px 10px;margin:6px 0;background:rgba(255,255,255,.7)}
.fx-rrow,.fx-cond{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0;font-size:13.5px}
.fx-rule select,.fx-rule input{font:400 13.5px var(--body);border:1px solid rgba(16,42,134,.22);border-radius:8px;padding:5px 7px;background:rgba(255,255,255,.9);color:var(--ink);max-width:100%}
.fx-cond select:first-child{max-width:15em}
.fx-cvs{display:flex;flex-wrap:wrap;gap:4px 10px}
.fx-cv{display:inline-flex;gap:4px;align-items:center;font-size:13px}
.fx-x,.fx-link{border:0;background:none;padding:2px 4px;font:600 12.5px var(--body);color:var(--ink);text-decoration:underline;text-underline-offset:3px;cursor:pointer;opacity:.8}
.fx-x:hover,.fx-link:hover{opacity:1}
.fx-warn{font-size:13px;font-weight:600;margin:0 0 6px;padding:4px 8px;border-left:3px solid var(--bt-orange);background:rgba(255,196,108,.22)}
.fx-gap{position:relative;height:18px;display:flex;align-items:center;justify-content:center}
.fx-gap.open{height:auto;flex-direction:column;padding:6px 0}
.fx-plus{border:1px solid rgba(16,42,134,.22);background:var(--paper);color:var(--ink);width:24px;height:24px;border-radius:999px;font-size:14px;line-height:1;padding:0;cursor:pointer;opacity:0;transition:opacity var(--dur-2) var(--ease)}
.fx-gap:hover .fx-plus,.fx-plus:focus-visible,.fx-gap.open .fx-plus{opacity:1}
.fx-menu{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;padding:10px;border:1px solid rgba(16,42,134,.18);border-radius:12px;background:rgba(255,255,255,.95);box-shadow:0 10px 28px rgba(16,42,134,.12);max-width:760px}
.fx-mi{border:1px solid rgba(16,42,134,.2);background:rgba(255,255,255,.9);border-radius:999px;padding:6px 12px;font:600 13px var(--body);color:var(--ink);cursor:pointer}
.fx-mi:hover,.fx-mi:focus-visible{background:var(--bt-navy);color:var(--bt-cream)}
.fx-tail{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px}
.fx-slash{flex:1 1 220px;border:1px dashed rgba(16,42,134,.3);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.5);font:400 14.5px var(--body);color:var(--ink)}
.fx-tail .fx-menu{flex-basis:100%}
.fx-mode{display:inline-flex;border:1px solid rgba(16,42,134,.25);border-radius:999px;padding:2px;margin:0 0 12px}
.fx-mode button{border:0;background:none;padding:6px 14px;border-radius:999px;font:600 13px var(--body);color:var(--ink);cursor:pointer}
.fx-mode button[aria-pressed=true]{background:var(--bt-navy);color:var(--bt-cream)}
.fx-pvbox{border:1px solid rgba(16,42,134,.16);border-radius:16px;padding:20px clamp(14px,3vw,28px);background:var(--paper);max-width:760px}
.fx-pvbox .btn{display:inline-block;background:var(--bt-navy);color:var(--bt-cream);border:0;border-radius:999px;padding:11px 22px;font:600 15px var(--body);cursor:pointer}
.fx-pvbox .btn.ghost{background:none;color:var(--ink);border:1px solid rgba(16,42,134,.3)}
@media (prefers-reduced-motion:reduce){.fx-blk,.fx-plus{transition:none!important}}
`;

// 編輯器上方「編輯／預覽」那一對按鈕。
export function modeHTML(mode, en) {
  return `<div class="fx-mode" role="group"><button type="button" data-act="fx-mode" data-v="edit" aria-pressed="${mode !== "preview"}">${esc(t("edit", en))}</button><button type="button" data-act="fx-mode" data-v="preview" aria-pressed="${mode === "preview"}">${esc(t("preview", en))}</button></div>`;
}

// 拖曳排序：掛在畫布外面那一個不會被換掉的元素上一次。onMove(fromId, toId)。
export function bindDrag(root, onMove) {
  if (!root || root.dataset.fxDrag === "1") return;
  root.dataset.fxDrag = "1";
  let from = null;
  root.addEventListener("dragstart", e => { const g = e.target.closest && e.target.closest("[data-fx-drag]"); if (!g) return; from = g.dataset.fxDrag; try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", from); const blk = g.closest("[data-fx-blk]"); if (blk) e.dataTransfer.setDragImage(blk, 20, 20); } catch (x) { /* 舊瀏覽器 */ } });
  root.addEventListener("dragover", e => { if (!from) return; const b = e.target.closest && e.target.closest("[data-fx-blk]"); if (!b) return; e.preventDefault(); for (const x of root.querySelectorAll(".fx-drop")) if (x !== b) x.classList.remove("fx-drop"); b.classList.add("fx-drop"); });
  root.addEventListener("dragleave", e => { const b = e.target.closest && e.target.closest("[data-fx-blk]"); if (b && !b.contains(e.relatedTarget)) b.classList.remove("fx-drop"); });
  root.addEventListener("drop", e => { const b = e.target.closest && e.target.closest("[data-fx-blk]"); if (!from || !b) return; e.preventDefault(); b.classList.remove("fx-drop"); const to = b.dataset.fxBlk; const f = from; from = null; if (to && to !== f) onMove(f, to); });
  root.addEventListener("dragend", () => { from = null; for (const x of root.querySelectorAll(".fx-drop")) x.classList.remove("fx-drop"); });
}
