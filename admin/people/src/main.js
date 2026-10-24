// 後台「人與權限」那一組的邏輯：幹部名單（職級、名字、職位、team 標籤）、工作區與指派、屆別與結束這一屆、
// 邀請碼、變動紀錄。2026-10-24 權限重新設計批 2，設計在 docs/2026-10-23-權限重新設計.md。
//
// 狀態只有一個 S，畫面只從 S 產生。**不在事件處理裡直接改 DOM**，一律改 S 再 render()。
// 每一顆按鈕背後都是資料庫的一支函式，門在那裡（require_president / require_senior / can_manage）；
// 這裡少畫一顆按鈕不是安全機制。
import * as AUTH from "../../../shared/auth.js";
import { navHTML } from "../../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

const HERE = "/admin/people/";

let S = {
  user: null, me: null, down: false, busy: false, msg: "",
  view: "roster",          // roster | person | person-new | workspaces | terms | invites | changes
  // 一定要有初始值：載入失敗之後再 render 一次不能整頁空白。
  people: [], terms: [], changes: [],
  filter: { term: null, team: "", q: "" }, // term 為 null 表示「這一屆」（rosterHTML 自己找 current）；q 是找名字
  afterEnd: null,                          // 結束這一屆之後名單最上面那一段 { term, kept: [profile_id…] }
  person: null, personDraft: null, remove: null, newDraft: null,
  workspaces: [], wsSel: null, members: [], wsDraft: null,
  termDraft: null, end: null,
  invites: [], inviteDraft: null,
};

const root = () => document.getElementById("bt-root");
// **這只是畫面。真正的門在資料庫。** senior 是 Co-President 或 Senior Adviser（跟 is_senior() 同一條規則）；
// 發碼、改名、刪人、改職級、結束這一屆只有 Co-President（pres），函式第一句會擋。
const isSenior = () => !!S.me && !!S.me.senior;
const isPres = () => !!S.me && !!S.me.pres;
const val = id => { const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; };
const findPerson = id => S.people.find(p => p.person_id === id);
const pname = p => UI.namesOf({ name_zh: p.name_zh, name_en: p.name_en }).name;

function render() {
  const el = root();
  if (!el) return;
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";

  if (S.down) { el.innerHTML = UI.shellHTML(nav, "", UI.downHTML(S.downErr)); return; }
  if (!S.user) { location.replace("../../app/?next=admin-people"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.shellHTML(nav, "", UI.notCadreHTML()); return; }
  if (!isSenior()) { el.innerHTML = UI.shellHTML(nav, UI.railHTML("people", "", S.me), UI.noAccessHTML(S.me)); return; }

  const filter = { term: S.filter.term || (UI.currentTerm(S.terms) || {}).id || "all", team: S.filter.team };
  let body, tab = "roster";
  if (S.view === "invites") { body = UI.invitesPageHTML(S.inviteList, S.invites, S.terms, S.msg, S.busy, S.inviteNew, S.inviteDraft, isPres()); tab = "invites"; }
  else if (S.view === "changes") { body = UI.changesHTML(S.changes, S.people, S.msg); tab = "changes"; }
  else if (S.view === "workspaces") { body = UI.workspacesHTML(S.workspaces, S.wsSel, S.members, S.people, S.msg, S.busy, S.wsDraft, isSenior()); tab = "workspaces"; }
  else if (S.view === "terms") { body = UI.termsHTML(S.terms, S.people, S.user.id, isPres(), S.msg, S.busy, S.termDraft, S.end); tab = "terms"; }
  else if (S.view === "person-new") body = UI.personNewHTML(S.terms, S.msg, S.busy, S.newDraft);
  else if (S.view === "person" && S.person) body = UI.personEditHTML(S.person, S.terms, S.user.id, isPres(), S.msg, S.busy, S.personDraft, S.people, S.remove, S.personEmail, S.workspaces);
  else body = UI.rosterHTML(S.people, S.terms, S.user.id, isPres(), S.msg, S.busy, filter, S.workspaces, S.afterEnd);
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("people", tab, S.me), body);
  UI.afterRender(S, el);
}

// 開頁連不上先自己再試一次（兩秒後），第二次才顯示「資料庫休眠中」。
// 2026-10-23 盤點時 Settings 一次載入失敗就整頁變成那一句，重開就好；一次抖動不該讓人去寄信求救。
function retryBoot() { return new Promise(r => setTimeout(() => r(boot(true)), 2000)); }
async function boot(retried) {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { if (!retried) return retryBoot(); S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { render(); return; }
    S.me = await D.loadMe(S.user.id);
    if (!S.me || S.me.role !== "cadre" || !isSenior()) { render(); return; }
    // ?tab= 或 #key 直接開某個分頁（README 的連結用得到）。
    const want = location.hash.slice(1) || new URLSearchParams(location.search).get("tab");
    await openTab(want);
  } catch (e) {
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../../app/?next=admin-people"); return; }
    console.error(HERE + " 載入失敗：", e);
    if (!retried) return retryBoot();
    S.downErr = String(e && e.message || e); S.down = true; render();
  }
}

async function openTab(key, ws) {
  key = String(key || "");
  // #ws=<代號>：直接開某一個工作區；#person=<id>：直接開某一個人（屆別結束之後那一段、總覽都連這種網址）。
  if (key.startsWith("ws=")) return openWorkspaces(decodeURIComponent(key.slice(3)));
  if (key.startsWith("person=")) {
    await openRoster();
    const p = findPerson(decodeURIComponent(key.slice(7)));
    if (p) { S.person = p; S.personDraft = null; S.remove = null; S.view = "person"; render(); loadEmail(p); }
    return;
  }
  if (key === "invites") return openInvites();
  if (key === "changes") return openRoster(false, "changes");
  if (key === "workspaces") return openWorkspaces(ws);
  if (key === "terms") return openTerms();
  return openRoster();
}

// 名單、屆別、變動紀錄三個查詢一起發。紀錄載不到不該讓名單打不開（遷移檔還沒跑的時候），各自接住。
async function loadCore(keepMsg) {
  if (!keepMsg) S.msg = "";
  const [people, terms, changes, workspaces] = await Promise.all([
    D.loadPeople(),
    D.loadTerms().catch(e => { S.msg = T("err.termsLoad") + D.says(e); return []; }),
    D.loadRoleChanges().catch(e => { S.msg = T("err.changesLoad") + D.says(e); return []; }),
    D.loadWorkspaces().catch(() => []),
  ]);
  S.people = people || []; S.terms = terms; S.changes = changes; S.workspaces = workspaces || [];
  if (S.person) S.person = findPerson(S.person.person_id) || null;
}
async function openRoster(keepMsg, view) {
  S.busy = true; render();
  try { await loadCore(keepMsg); S.view = view || "roster"; S.busy = false; }
  catch (e) { S.busy = false; S.msg = T("err.rosterLoad") + D.says(e); S.view = "roster"; }
  render();
}
// 邀請頁（2026-10-29）：邀請清單（senior）加舊的批次碼（president 才讀得到，別人讀到空的就空的）。
async function openInvites(keepMsg) {
  S.busy = true; if (!keepMsg) S.msg = ""; render();
  try {
    if (!S.terms.length) await loadCore(true);
    S.inviteList = await D.loadInviteList();
    S.invites = isPres() ? await D.loadInvites().catch(() => []) : [];
    if (!S.inviteDraft) S.inviteDraft = { code: UI.suggestCode(), grants: "cadre", uses: 1, note: "" };
    S.view = "invites"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.inviteList") + D.says(e); S.view = "invites"; }
  render();
}
function readInviteForm() {
  const rank = val("in-rank"), team = UI.isOrgWide(rank) ? "" : val("in-team");
  const t = rank && rank !== "custom" ? UI.deriveTitle(rank, team) : { title_en: val("in-ten"), title_zh: val("in-tzh") };
  return { email: val("in-email"), who: val("in-who") || "cadre:member", rank, team, term: val("in-term"),
           name_zh: val("in-zh"), name_en: val("in-en"), title_en: rank ? t.title_en : "", title_zh: rank ? t.title_zh : "",
           line: val("in-line"), note: val("in-note") };
}
async function openWorkspaces(ws, keepMsg) {
  S.busy = true; if (!keepMsg) S.msg = ""; render();
  try {
    if (!S.people.length) await loadCore(true);
    S.workspaces = await D.loadWorkspaces();
    if (ws) S.wsSel = ws;
    if (S.wsSel && !S.workspaces.some(w => w.id === S.wsSel)) S.wsSel = null;
    S.members = S.wsSel ? await D.loadMembers(S.wsSel).catch(e => { S.msg = T("err.membersLoad") + D.says(e); return []; }) : [];
    S.view = "workspaces"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.wsLoad") + D.says(e); S.view = "workspaces"; }
  render();
}
async function openTerms(keepMsg) {
  S.busy = true; render();
  try { await loadCore(keepMsg); S.view = "terms"; S.busy = false; }
  catch (e) { S.busy = false; S.msg = T("err.termsLoad") + D.says(e); S.view = "terms"; }
  render();
}
// 做完一件事之後回到同一個人的頁面（名單重讀，人用 person_id 再找一次）。
async function reopenPerson(id, msg) {
  S.msg = msg || "";
  try { await loadCore(true); } catch (e) { S.msg += T("err.rosterLoad") + D.says(e); }
  S.person = findPerson(id) || null; S.personDraft = null; S.remove = null;
  S.view = S.person ? "person" : "roster"; S.busy = false; render();
  if (S.person && S.personEmail === undefined) loadEmail(S.person);
}
// 註冊用的 email（2026-10-26）：另外叫一次 person_email()，回來再重畫那一行。沒有帳號不叫。
// 載不到不擋整頁，只是那一行停在「載入中」。
async function loadEmail(p) {
  S.personEmail = undefined;
  if (!p || !p.profile_id) { S.personEmail = null; return; }
  try { S.personEmail = await D.personEmail(p.person_id); } catch (e) { S.personEmail = undefined; }
  if (S.person && S.person.person_id === p.person_id) render();
}
async function run(label, fn) {
  S.busy = true; S.msg = ""; render();
  try { return await fn(); }
  catch (err) { S.busy = false; S.msg = T(label) + D.says(err); render(); return undefined; }
}

// 改一個人那一頁的表單值。只讀畫面上開著的欄位；關著的（自己的職級、Senior Adviser 看到的名字）照原值。
// 這一屆的職位是一張清單（2026-10-26）：每一列 { orig, title_zh, title_en, team }，orig 是原本的 team（新加的是 null）。
function readPosRows(p, termId) {
  const els = [...document.querySelectorAll("[data-posrow]")];
  if (!els.length && !document.getElementById("pk-term")) {
    return UI.positionsFor(p, termId).map(x => ({ orig: x.team || "", title_zh: x.title_zh || "", title_en: x.title_en || "", team: x.team || "" }));
  }
  return els.map(el => {
    const i = el.dataset.posrow;
    const rank = val(`pk-rank-${i}`), team = UI.isOrgWide(rank) ? "" : val(`pk-pteam-${i}`);
    const t = rank && rank !== "custom" ? UI.deriveTitle(rank, team) : { title_zh: val(`pk-tzh-${i}`), title_en: val(`pk-ten-${i}`) };
    return { orig: el.dataset.isnew === "1" ? null : (el.dataset.orig || ""), rank, title_zh: t.title_zh, title_en: t.title_en, team };
  });
}
function readPersonForm(p) {
  const roleEl = document.getElementById("pk-role");
  const termId = val("pk-term") || (S.personDraft && S.personDraft.term) || (UI.currentTerm(S.terms) || {}).id || "";
  return {
    board_role: roleEl && !roleEl.disabled ? roleEl.value : (p.board_role || "member"),
    name_zh: document.getElementById("pk-zh") && !document.getElementById("pk-zh").disabled ? val("pk-zh") : (p.name_zh || ""),
    name_en: document.getElementById("pk-en") && !document.getElementById("pk-en").disabled ? val("pk-en") : (p.name_en || ""),
    term: termId,
    rows: readPosRows(p, termId),
    team: document.querySelector('input[name="team"]')
      ? [...document.querySelectorAll('input[name="team"]:checked')].map(x => x.value.trim()).filter(Boolean).join(", ")
      : (p.team || ""),
    code: val("pk-code"),
  };
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;

  if (act === "retry") { location.reload(); return; }
  if (act === "ask-cancel") { UI.cancelAsk(S, root()); return; }
  if (act === "lang") { switchLang(b.dataset.lang); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../../app/"); return; }
  if (act === "tab") {
    e.preventDefault(); S.msg = "";
    history.pushState(null, "", "#" + b.dataset.t);
    await openTab(b.dataset.t, b.dataset.ws);
    return;
  }
  if (act === "roster-term") { S.filter.term = b.dataset.v || "all"; render(); return; }
  if (act === "roster-team") { S.filter.team = b.dataset.v || ""; render(); return; }
  if (act === "roster-back") { S.person = null; S.personDraft = null; S.remove = null; S.newDraft = null; history.pushState(null, "", "#roster"); await openRoster(); return; }
  if (act === "after-dismiss") { S.afterEnd = null; render(); return; }

  // ── 一個人 ──────────────────────────────────────────────────────────
  if (act === "person-edit") {
    const p = findPerson(b.dataset.id);
    if (!p) { S.msg = T("err.noPerson"); render(); return; }
    S.person = p; S.personDraft = null; S.remove = null; S.view = "person"; S.msg = "";
    history.pushState(null, "", "#person=" + encodeURIComponent(p.person_id));
    render();
    loadEmail(p); return;
  }
  if (act === "person-save") {
    const p = findPerson(b.dataset.id);
    if (!p) { S.msg = T("err.noPerson"); render(); return; }
    const f = readPersonForm(p);
    S.personDraft = f;
    const cadre = !!p.profile_id && p.role === "cadre";
    const roleChanged = cadre && f.board_role !== (p.board_role || "member");
    const nameChanged = f.name_zh !== (p.name_zh || "") || f.name_en !== (p.name_en || "");
    // 職位清單的差異：原本那一筆（orig）改了名稱或換了 team，或新加的一列有填。
    // 換了 team 等於「刪舊的那一筆、存一筆新的」，因為唯一鍵是 人 × 屆 × team。
    const posOps = [];
    const seenTeams = new Set();
    for (const r of f.rows) {
      const empty = !r.title_zh && !r.title_en;
      if (r.orig == null && empty) continue;
      if (seenTeams.has(r.team)) { S.msg = T("err.posTeamDup"); render(); return; }
      seenTeams.add(r.team);
      if (empty) { S.msg = T("err.titleRequired"); render(); return; }
      const before = r.orig == null ? null : UI.positionsFor(p, f.term).find(x => (x.team || "") === r.orig);
      const same = before && (before.title_zh || "") === r.title_zh && (before.title_en || "") === r.title_en && (before.team || "") === r.team;
      if (same) continue;
      if (before && (before.team || "") !== r.team) posOps.push({ del: r.orig });
      posOps.push({ set: r });
    }
    const posChanged = posOps.length > 0;
    const teamChanged = cadre && UI.parseTeams(f.team).join("|") !== UI.parseTeams(p.team).join("|");
    if (!roleChanged && !nameChanged && !posChanged && !teamChanged) { S.msg = T("err.nothingChanged"); render(); return; }
    if (nameChanged && !f.name_zh && !f.name_en) { S.msg = T("err.nameRequired"); render(); return; }
    // ⚠ 升成 Co-President 等於把整個後台給他，包括把你降級。畫面多問一次，資料庫那一側刻意不擋（換屆要用）。
    if (roleChanged && f.board_role === "president" && UI.needAsk(S, b, T("confirm.promote", { name: pname(p) }))) return;
    S.busy = true; S.msg = ""; render();
    const done = [];
    try {
      if (roleChanged) { await D.setBoardRole(p.profile_id, f.board_role); done.push(T("msg.roleTo", { role: UI.boardLabel(f.board_role) })); }
      if (nameChanged) { await D.renamePerson(p.person_id, f.name_zh, f.name_en); done.push(T("msg.nameTo", { name: f.name_zh || f.name_en })); }
      for (const op of posOps) {
        if (op.del != null) { await D.deletePosition(p.person_id, f.term, op.del); done.push(T("msg.positionGone", { term: f.term })); }
        else { await D.setPosition(p.person_id, f.term, op.set.title_zh, op.set.title_en, op.set.team); done.push(T("msg.positionTo", { term: f.term, title: op.set.title_en || op.set.title_zh })); }
      }
      if (teamChanged) { await D.setTeam(p.profile_id, f.team); done.push(T("msg.teamTo", { team: f.team || T("value.none") })); }
      // 存了一筆帶 team 的 Director 職位（Paul 2026-10-23 第 4 題）：問一句、一顆鈕同時給那個 team 的申請與資源「管」。不自動送，
      // 因為一個打錯 team 的職位會送出兩筆權限。只問最後一筆；他已經兩個都是「管」就不問。
      const dirTeam = f.board_role === "director" ? (posOps.filter(op => op.set && op.set.team).map(op => op.set.team).pop() || "") : "";
      // 2026-10-30 起申請是整個 BT 一個工作區：Director 配的是那個 team 的資源「管」加整個申請「改」。
      const hasBoth = t => (p.workspaces || []).some(w => w.id === "res:" + t && w.level === "manage") && (p.workspaces || []).some(w => w.id === "apps" && ["edit", "manage"].includes(w.level));
      if (dirTeam && !hasBoth(dirTeam)) {
        const who = f.name_zh || f.name_en || pname(p), pid = p.profile_id, personId = p.person_id;
        S.undo = { label: T("pe.grantBoth", { team: dirTeam }), fn: async () => {
          const r = await run("err.assign", async () => { await D.assign(pid, "res:" + dirTeam, "manage"); await D.assign(pid, "apps", "edit"); return true; });
          if (r !== undefined) await reopenPerson(personId, T("msg.grantedBoth", { name: who, team: dirTeam }));
        } };
      }
      await reopenPerson(p.person_id, T("msg.personSaved", { name: f.name_zh || f.name_en || pname(p), done: done.join(T("punct.list")) }));
    } catch (err) {
      // 前面幾步做好了、後面那一步沒做到要講清楚，不然他會把做好的那一半再做一次。
      S.busy = false;
      S.msg = (done.length ? T("msg.partial", { done: done.join(T("punct.list")) }) : "") + T("err.save") + D.says(err);
      render();
    }
    return;
  }
  if (act === "position-delete") {
    const p = findPerson(b.dataset.id); if (!p) return;
    if (UI.needAsk(S, b, T("confirm.deletePosition", { term: b.dataset.term, team: b.dataset.team || T("value.none") }))) return;
    const ok = await run("err.save", () => D.deletePosition(p.person_id, b.dataset.term, b.dataset.team || ""));
    if (ok !== undefined) await reopenPerson(p.person_id, T("msg.personSaved", { name: pname(p), done: T("msg.positionGone", { term: b.dataset.term }) }));
    return;
  }
  // 職位清單加一列、拿掉還沒存的那一列：只動 S.personDraft.rows，重畫。
  if (act === "position-row-add" || act === "position-row-drop") {
    if (!S.person) return;
    const f = readPersonForm(S.person);
    if (act === "position-row-add") f.rows.push({ orig: null, title_zh: "", title_en: "", team: "" });
    else f.rows.splice(Number(b.dataset.i), 1);
    S.personDraft = f; render(); return;
  }
  if (act === "copy-email") {
    try { await navigator.clipboard.writeText(b.dataset.email); S.msg = T("msg.copied", { email: b.dataset.email }); }
    catch (e) { S.msg = T("err.copy"); }
    render(); return;
  }
  if (act === "person-code") {
    const p = findPerson(b.dataset.id); if (!p) return;
    const code = val("pk-code") || UI.suggestCode();
    const made = await run("err.issueCode", () => D.createInviteFor(p.person_id, code, pname(p)));
    if (made !== undefined) await reopenPerson(p.person_id, T("msg.codeIssued", { code: made }));
    return;
  }
  if (act === "record-delete") {
    const p = findPerson(b.dataset.id); if (!p) return;
    if (UI.needAsk(S, b, T("confirm.deleteRecord", { name: pname(p) }))) return;
    const ok = await run("err.remove", () => D.deletePerson(p.person_id));
    if (ok !== undefined) { S.person = null; S.msg = T("msg.recordDeleted"); await openRoster(true); }
    return;
  }
  if (act === "member-remove") { S.remove = { typed: "" }; S.msg = ""; render(); return; }
  if (act === "member-remove-cancel") { S.remove = null; render(); return; }
  if (act === "member-remove-go") {
    const p = findPerson(b.dataset.id); if (!p) return;
    const typed = val("pk-confirm");
    S.remove = { typed };
    // 兩步確認：名字要打一模一樣。這是防手滑的，不是門；門在 remove_member() 第一句。
    if (typed !== b.dataset.name) { S.msg = T("err.nameMismatch"); render(); return; }
    const ok = await run("err.remove", () => D.removeMember(p.person_id));
    if (ok !== undefined) await reopenPerson(p.person_id, T("msg.removed", { name: pname(p) }));
    return;
  }
  if (act === "person-merge") {
    const keep = findPerson(b.dataset.keep), drop = findPerson(b.dataset.drop);
    if (!keep || !drop) return;
    if (UI.needAsk(S, b, T("confirm.merge", { keep: pname(keep), drop: pname(drop) }))) return;
    const ok = await run("err.merge", () => D.mergePeople(keep.person_id, drop.person_id));
    if (ok !== undefined) await reopenPerson(keep.person_id, T("msg.merged"));
    return;
  }
  if (act === "person-new") { S.newDraft = null; S.view = "person-new"; S.msg = ""; render(); return; }
  if (act === "person-create") {
    const rank = val("pn-rank"), pteam = UI.isOrgWide(rank) ? "" : val("pn-pteam");
    const t = rank && rank !== "custom" ? UI.deriveTitle(rank, pteam) : { title_en: val("pn-ten"), title_zh: val("pn-tzh") };
    const d = { name_zh: val("pn-zh"), name_en: val("pn-en"), term: val("pn-term"), rank, title_en: t.title_en, title_zh: t.title_zh, pteam, note: val("pn-note") };
    S.newDraft = d;
    if (!d.name_zh && !d.name_en) { S.msg = T("err.nameRequired"); render(); return; }
    if (!rank) { S.msg = T("err.rankRequired"); render(); return; }
    if (!d.title_zh && !d.title_en) { S.msg = T("err.titleRequired"); render(); return; }
    const id = await run("err.save", async () => {
      const pid = await D.addPerson(d.name_zh, d.name_en, d.note);
      await D.setPosition(pid, d.term, d.title_zh, d.title_en, d.pteam);
      return pid;
    });
    if (id !== undefined) { S.newDraft = null; S.msg = T("msg.personCreated", { name: d.name_zh || d.name_en }); await openRoster(true); S.filter.term = "all"; render(); }
    return;
  }

  // ── 工作區與指派 ───────────────────────────────────────────────────
  if (act === "ws-pick") { e.preventDefault(); S.wsDraft = null; history.pushState(null, "", "#ws=" + encodeURIComponent(b.dataset.ws)); await openWorkspaces(b.dataset.ws); return; }
  // 多選加人的 chip、全勾、全取消（2026-10-24）：右欄是 pk、新增表單是 npk。打字與勾選走 input / change。
  if (["pk-team", "pk-all", "pk-none", "pk-untick"].includes(act) && S.view === "workspaces") { pkApply(b); render(); return; }
  if (act === "ws-assign") {
    // 一次加一批（2026-10-24）：每個人一支 assign()（同一道門），同時送；沒有新的資料庫函式。
    const ws = b.dataset.ws, d = S.wsDraft || {}, pk = d.pk || {}, level = pk.level || "view";
    const ids = UI.pkPicked(pkPeople(), S.members.map(m => m.user_id), pk);
    if (!ids.length) { S.msg = T("err.pickPerson"); render(); return; }
    S.busy = true; S.msg = ""; render();
    const out = await Promise.all(ids.map(id => D.assign(id, ws, level).then(() => null, e => ({ id, e }))));
    const failed = out.filter(Boolean), done = ids.filter(id => !failed.some(f => f.id === id));
    S.wsDraft = Object.assign({}, d, { pk: Object.assign({}, pk, { q: "", ticked: failed.map(f => f.id) }) });
    if (done.length) {
      // 復原移出的是這一批那 N 個人，不多不少。
      const undo = UI.batchUndo(done, id => D.unassign(id, ws));
      S.undo = async () => { const n = await run("err.unassign", undo); if (n !== undefined) { S.msg = T("msg.unassignedN", { n, ws }); await openWorkspaces(null, true); } };
    }
    S.busy = false;
    if (failed.length) {
      const names = failed.map(f => { const p = S.people.find(x => x.profile_id === f.id); return p ? pname(p) : f.id; }).join(T("punct.list"));
      S.msg = T("err.assignSome") + names + T("punct.colon") + D.says(failed[0].e);
    } else S.msg = T("msg.assignedN", { n: done.length, ws, level: UI.levelLabel(level) });
    await openWorkspaces(null, true);
    return;
  }
  if (act === "ws-cleanup") {
    // 清掉靠職級就有一切的人身上多餘的指派（2026-10-24）。復原是照原本的等級派回去。
    const ws = S.wsSel, ids = String(b.dataset.ids || "").split(",").filter(Boolean);
    const was = ids.map(id => ({ id, level: (S.members.find(m => m.user_id === id) || {}).level || "view" }));
    if (!ids.length) return;
    const ok = await run("err.unassign", async () => { for (const id of ids) await D.unassign(id, ws); return true; });
    if (ok !== undefined) {
      S.msg = T("msg.cleaned", { n: ids.length });
      S.undo = async () => { const r = await run("err.assign", async () => { for (const w of was) await D.assign(w.id, ws, w.level); return true; }); if (r !== undefined) { S.msg = T("msg.uncleaned", { n: was.length }); await openWorkspaces(null, true); } };
      await openWorkspaces(null, true);
    }
    return;
  }
  if (act === "ws-unassign") {
    const p = S.people.find(x => x.profile_id === b.dataset.id);
    if (UI.needAsk(S, b, T("confirm.unassign", { name: p ? pname(p) : "", ws: S.wsSel }))) return;
    const ws = S.wsSel, id = b.dataset.id;
    const was = (S.members.find(m => m.user_id === id) || {}).level || "view";
    const ok = await run("err.unassign", () => D.unassign(id, ws));
    if (ok !== undefined) {
      S.msg = T("msg.unassigned", { name: p ? pname(p) : "", ws });
      S.undo = async () => { const r = await run("err.assign", () => D.assign(id, ws, was)); if (r !== undefined) { S.msg = T("msg.assigned", { name: p ? pname(p) : "", ws, level: UI.levelLabel(was) }); await openWorkspaces(null, true); } };
      await openWorkspaces(null, true);
    }
    return;
  }
  if (act === "ws-create") {
    // 一開始就放進去的人（2026-10-24 改成多選那一塊）：勾起來的人都是同一個等級。
    const npk = (S.wsDraft || {}).npk || {};
    const members = UI.pkPicked(pkPeople(), [], npk).map(id => ({ id, level: npk.level || "view" }));
    const d = Object.assign({}, S.wsDraft, { slug: val("wsn-slug") || UI.slugify(val("wsn-en")), title_zh: val("wsn-zh"), title_en: val("wsn-en"), owner: val("wsn-owner"), members });
    S.wsDraft = d;
    const id = await run("err.createWs", () => D.createWorkspace(d.slug, d.title_zh, d.title_en, d.owner || null));
    if (id === undefined) return;
    // 建好了再派人，一個一個送；中途有人派不進去，講清楚是誰，前面派好的留著。
    let n = 0;
    for (const m of members) {
      try { await D.assign(m.id, id, m.level); n++; }
      catch (err) {
        const p = S.people.find(x => x.profile_id === m.id);
        S.busy = false; S.wsDraft = Object.assign({}, d, { npk: Object.assign({}, npk, { ticked: members.slice(n).map(m => m.id) }) });
        S.msg = T("err.wsMembers") + (p ? pname(p) + T("punct.colon") : "") + D.says(err);
        await openWorkspaces(id, true); return;
      }
    }
    S.wsDraft = null; S.msg = T("msg.wsCreatedWith", { name: d.title_en || d.title_zh || id, n });
    await openWorkspaces(id, true);
    return;
  }

  // ── 屆別 ───────────────────────────────────────────────────────────
  if (act === "term-create") {
    const nw = { id: val("tm-id"), zh: val("tm-zh"), en: val("tm-en"), starts: val("tm-starts"), ends: val("tm-ends") };
    S.termDraft = Object.assign({}, S.termDraft, { new: nw });
    const id = await run("err.createTerm", () => D.createTerm(nw.id, nw.zh, nw.en, nw.starts || null, nw.ends || null));
    if (id !== undefined) { S.termDraft = Object.assign({}, S.termDraft, { new: null }); S.msg = T("msg.termCreated", { id }); await openTerms(true); }
    return;
  }
  if (act === "paste-preview" || act === "paste-cancel") {
    const ps = { term: val("tp-term"), text: val("tp-text") };
    if (act === "paste-preview") {
      ps.preview = UI.pasteParse(ps.text);
      if (!ps.preview.rows.length) { S.msg = T("err.pasteEmpty"); ps.preview = null; } else S.msg = "";
    } else S.msg = "";
    S.termDraft = Object.assign({}, S.termDraft, { paste: ps }); render(); return;
  }
  if (act === "paste-go") {
    const ps = (S.termDraft && S.termDraft.paste) || {};
    if (!ps.preview || !ps.preview.rows.length) { S.msg = T("err.pasteEmpty"); render(); return; }
    const n = await run("err.paste", () => D.importPositions(ps.term, ps.preview.rows));
    if (n !== undefined) { S.termDraft = Object.assign({}, S.termDraft, { paste: null }); S.msg = T("msg.pasted", { n, term: ps.term }); await openTerms(true); }
    return;
  }
  // 結束這一屆：三步。每一步都把填的東西收進 S.end，重畫不會掉。
  if (act === "end-start") { S.end = { step: 1, next: { id: UI.nextTermId((UI.currentTerm(S.terms) || {}).id) }, keep: [S.user.id], typed: "" }; S.msg = ""; render(); return; }
  if (act === "end-cancel") { S.end = null; render(); return; }
  if (act === "end-step2") {
    const n = { id: val("en-id"), zh: val("en-zh"), en: val("en-en"), starts: val("en-starts"), ends: val("en-ends") };
    S.end = Object.assign({}, S.end, { next: n });
    if (!n.id || !n.starts || !n.ends) { S.msg = T("err.endDates"); render(); return; }
    S.end.step = 2; S.msg = ""; render(); return;
  }
  const readKeep = () => [...document.querySelectorAll('input[name="keep"]:checked')].map(x => x.value).concat([S.user.id]);
  if (act === "end-keep-all") { S.end = Object.assign({}, S.end, { keep: S.people.filter(p => p.profile_id && p.role === "cadre").map(p => p.profile_id) }); render(); return; }
  if (act === "end-keep-none") { S.end = Object.assign({}, S.end, { keep: [S.user.id] }); render(); return; }
  if (act === "end-back1") { S.end = Object.assign({}, S.end, { keep: readKeep(), step: 1 }); render(); return; }
  if (act === "end-step3") { S.end = Object.assign({}, S.end, { keep: readKeep(), step: 3 }); S.msg = ""; render(); return; }
  if (act === "end-back2") { S.end = Object.assign({}, S.end, { typed: val("en-typed"), step: 2 }); render(); return; }
  if (act === "end-go") {
    const typed = val("en-typed");
    S.end = Object.assign({}, S.end, { typed });
    const n = S.end.next || {};
    if (typed !== n.id) { S.msg = T("err.typedWrong"); render(); return; }
    const cur = UI.currentTerm(S.terms) || {};
    const keep = [...new Set(S.end.keep.concat([S.user.id]))];
    const r = await run("err.endTerm", () => D.endTerm(n.id, n.zh, n.en, n.starts, n.ends, keep));
    if (r !== undefined) {
      S.end = null;
      S.msg = T("msg.ended", { term: cur.id, next: r.term || n.id, stay: r.kept, go: r.alumni });
      S.afterEnd = { term: cur.id, kept: keep.filter(id => id !== S.user.id) };
      S.filter.term = null;
      await openRoster(true);
    }
    return;
  }

  // ── 邀請信（2026-10-29）────────────────────────────────────────────
  if (act === "invite-send") {
    const d = readInviteForm(); S.inviteNew = d;
    if (!d.email) { S.msg = T("err.emailRequired"); render(); return; }
    const grants = d.who.startsWith("cadre:") ? "cadre" : d.who;
    const boardRank = grants === "cadre" ? d.who.slice(6) : "";
    if (grants === "cadre" && !boardRank) { S.msg = T("err.rankRequired2"); render(); return; }
    if ((d.title_en || d.title_zh) && !d.term) { S.msg = T("err.termRequired"); render(); return; }
    const code = await run("err.invite", () => D.invitePerson({ email: d.email, grants, rank: boardRank, name_zh: d.name_zh, name_en: d.name_en,
      title_en: d.title_en, title_zh: d.title_zh, team: d.team, term: d.term, line: d.line, note: d.note }));
    if (code === undefined) return;
    // 排進去了就立刻寄。寄不出去不是邀請失敗：碼已經在，清單上會標「排隊中」，再按重寄或等下一次寄信。
    let mailErr = "";
    try { await D.sendMail(); } catch (e) { mailErr = D.says(e); }
    S.inviteNew = null;
    S.msg = mailErr ? T("msg.invitedQueued", { code }) + mailErr : T("msg.invited", { email: d.email, code });
    await openInvites(true);
    return;
  }
  if (act === "invite-resend") {
    const code = await run("err.resend", () => D.resendInvite(b.dataset.code));
    if (code === undefined) return;
    let mailErr = "";
    try { await D.sendMail(); } catch (e) { mailErr = D.says(e); }
    S.msg = mailErr ? T("msg.invitedQueued", { code }) + mailErr : T("msg.resent", { email: b.dataset.email, code });
    await openInvites(true);
    return;
  }
  if (act === "invite-revoke") {
    if (UI.needAsk(S, b, T("confirm.revokeInvite", { email: b.dataset.email }))) return;
    const ok = await run("err.revoke", () => D.revokeInvite(b.dataset.code));
    if (ok === undefined) return;
    S.msg = T("msg.revoked", { email: b.dataset.email });
    await openInvites(true);
    return;
  }

  // ── 邀請碼的新增與停用（2026-10-14）────────────────────────────────
  if (act === "invite-suggest" || act === "invite-new") {
    S.inviteDraft = { code: val("ic-code"), grants: val("ic-grants") || "cadre",
                      uses: val("ic-uses") || "1", note: val("ic-note") };
    if (act === "invite-suggest") { S.inviteDraft.code = UI.suggestCode(); render(); return; }
    if (!S.inviteDraft.code) { S.msg = T("err.codeRequired"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const made = await D.createInvite(S.inviteDraft.code, S.inviteDraft.grants,
                                        S.inviteDraft.uses, S.inviteDraft.note);
      S.invites = await D.loadInvites();
      S.inviteDraft = { code: UI.suggestCode(), grants: S.inviteDraft.grants, uses: 1, note: "" };
      S.busy = false; S.msg = T("msg.codeCreated", { code: made });
    } catch (err) { S.busy = false; S.msg = T("err.createCode") + D.says(err); }
    render();
    return;
  }
  if (act === "invite-disable") {
    const code = b.dataset.code;
    if (UI.needAsk(S, b, T("confirm.disableCode", { code }))) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.disableInvite(code);
      S.invites = await D.loadInvites();
      S.busy = false; S.msg = T("msg.codeDisabled", { code });
    } catch (err) { S.busy = false; S.msg = T("err.disable") + D.says(err); }
    render();
    return;
  }
});

// 兩個下拉選單是「選了就動」的：改一個人那一頁換屆別（表單換成那一屆的職位）、工作區裡改等級（直接存）。
document.addEventListener("change", async e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  // 職位下拉換了（2026-10-24）：重畫一次，選「自訂」才露出文字框。加一筆過去的紀錄那一頁也用同一個 data-act。
  if (el.dataset.act === "pos-rank") {
    if (S.view === "invites") { S.inviteNew = Object.assign(readInviteForm(), { rank: el.value }); render(); return; }
    if (S.view === "person-new") {
      const val2 = i => { const x = document.getElementById(i); return x ? String(x.value || "").trim() : ""; };
      S.newDraft = Object.assign({}, S.newDraft, { name_zh: val2("pn-zh"), name_en: val2("pn-en"), term: val2("pn-term"), rank: el.value, title_en: val2("pn-ten"), title_zh: val2("pn-tzh"), pteam: val2("pn-pteam"), note: val2("pn-note") });
      render(); return;
    }
    if (S.person) { S.personDraft = readPersonForm(S.person); render(); }
    return;
  }
  if (el.dataset.act === "person-term" && S.person) {
    const f = readPersonForm(S.person);
    // 換屆別：清單換成那一屆的職位，改到一半的不帶過去。
    f.rows = UI.positionsFor(S.person, f.term).map(x => ({ orig: x.team || "", title_zh: x.title_zh || "", title_en: x.title_en || "", team: x.team || "" }));
    S.personDraft = f;
    render(); return;
  }
  // 存取格（2026-10-23 批 2）：一格改了就送。選「無」是移出，其他是派進去或改等級；toast 帶復原（送回原值）。
  if (el.dataset.act === "grid-level" && S.person) {
    const id = el.dataset.id, ws = el.dataset.ws, level = el.value;
    const p = S.person, personId = p.person_id, who = pname(p);
    const was = ((p.workspaces || []).find(w => w.id === ws) || {}).level || "";
    if (was === level) return;
    const send = lv => lv ? D.assign(id, ws, lv) : D.unassign(id, ws);
    const ok = await run(level ? "err.assign" : "err.unassign", () => send(level));
    if (ok === undefined) { await reopenPerson(personId, S.msg); return; }
    const wsn = UI.wsName(ws, S.workspaces);
    S.undo = async () => {
      const r = await run(was ? "err.assign" : "err.unassign", () => send(was));
      if (r !== undefined) await reopenPerson(personId, was ? T("msg.cell", { name: who, ws: wsn, level: UI.levelLabel(was) }) : T("msg.cellNone", { name: who, ws: wsn }));
    };
    await reopenPerson(personId, level ? T("msg.cell", { name: who, ws: wsn, level: UI.levelLabel(level) }) : T("msg.cellNone", { name: who, ws: wsn }));
    return;
  }
  // 名單列上直接填 team（還沒填的人才有這個下拉）。toast 帶復原（清回空的）。
  if (el.dataset.act === "row-team" && el.value) {
    const id = el.dataset.id, team = el.value;
    const p = S.people.find(x => x.profile_id === id);
    const ok = await run("err.save", () => D.setTeam(id, team));
    if (ok === undefined) { render(); return; }
    S.undo = async () => { const r = await run("err.save", () => D.setTeam(id, "")); if (r !== undefined) { S.msg = T("msg.teamSet", { name: p ? pname(p) : "", team: T("value.none") }); await openRoster(true); } };
    S.msg = T("msg.teamSet", { name: p ? pname(p) : "", team });
    await openRoster(true);
    return;
  }
  if (el.dataset.act === "wsn-team") {
    S.wsDraft = Object.assign({}, S.wsDraft, { team: el.value, owner: "", slug: val("wsn-slug"), title_zh: val("wsn-zh"), title_en: val("wsn-en") });
    render(); return;
  }
  // 多選加人（2026-10-24）：勾一個人、換等級。
  if (el.dataset.act === "pk-tick" || el.dataset.act === "pk-level") { if (S.view === "workspaces") { pkApply(el); render(); } return; }
  if (el.dataset.act === "ws-level" && S.wsSel) {
    const p = S.people.find(x => x.profile_id === el.dataset.id);
    const level = el.value, ws = S.wsSel, id = el.dataset.id;
    const was = (S.members.find(m => m.user_id === id) || {}).level || "view";
    const ok = await run("err.assign", () => D.assign(id, ws, level));
    if (ok !== undefined) {
      S.msg = T("msg.assigned", { name: p ? pname(p) : "", ws, level: UI.levelLabel(level) });
      S.undo = async () => { const r = await run("err.assign", () => D.assign(id, ws, was)); if (r !== undefined) { S.msg = T("msg.assigned", { name: p ? pname(p) : "", ws, level: UI.levelLabel(was) }); await openWorkspaces(null, true); } };
      await openWorkspaces(null, true);
    }
  }
});

// 打字的即時反應（2026-10-23 批 2）。找名字：改 S 再 render()，然後把游標放回搜尋框，不然每打一個字就失焦。
// 自訂工作區的代號：英文名稱打到哪，代號跟到哪（使用者自己改過代號之後就不跟了）。這一條直接改那一格，不重畫。
document.addEventListener("input", e => {
  const el = e.target;
  if (!el || !el.id) return;
  if (el.id === "ro-search") {
    S.filter.q = el.value; render();
    const again = document.getElementById("ro-search");
    if (again) { again.focus(); const n = again.value.length; try { again.setSelectionRange(n, n); } catch (x) { /* search 型的欄位有的瀏覽器不給 */ } }
    return;
  }
  if ((el.dataset.act === "pk-q" || el.dataset.act === "pk-mq") && S.view === "workspaces") { pkApply(el); render(); UI.pkRefocus(el.dataset.ns, el.dataset.act === "pk-mq" ? "mq" : "q"); return; }
  if (el.id === "wsn-en") {
    const slug = document.getElementById("wsn-slug");
    if (slug && (!slug.value || slug.dataset.auto === "1")) { slug.value = UI.slugify(el.value); slug.dataset.auto = "1"; }
    return;
  }
  if (el.id === "wsn-slug") el.dataset.auto = "0";
});

// 語言（2026-10-19 中英切換，做法見 docs/2026-10-19-後台中英切換.md）。
// 開頁：網址 ?lang= 先、再上次存在 localStorage 的、都沒有就英文（Paul 拍板預設英文）。
// 切換：改字典的語言、存起來、把 ?lang= 寫進網址、重畫。**不重新載入頁面**，填到一半的東西都在 S 裡不會不見。
function readStored() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
function applyLang(l) {
  setLang(l);
  document.documentElement.lang = lang() === "zh" ? "zh-Hant" : "en";
  document.title = T("title");
}
function switchLang(l) {
  applyLang(l);
  try { localStorage.setItem(STORE_KEY, lang()); } catch (e) { /* 無痕視窗存不了，這一頁照樣切 */ }
  const u = new URL(location.href); u.searchParams.set("lang", lang());
  history.replaceState(null, "", u.pathname + u.search + u.hash);
  render();
}
applyLang(pickLang(location.search, readStored()));
boot();
// 瀏覽器上一頁、或自己在網址列改 #分頁：跟著換分頁（2026-10-23 盤點 F3）。側欄點分頁是 pushState，所以上一頁回得去。
window.addEventListener("popstate", () => { if (S.me) { S.msg = ""; openTab(location.hash.slice(1)); } });

// 多選加人（2026-10-24）：Workspaces 這一頁有兩塊，右欄（ns "ws"，已經在裡面的人不列）與新增表單（ns "wsn"，全部幹部）。
// 事件丟給 UI.pkReduce 算出新狀態，存回 S.wsDraft.pk / .npk。pkPeople() 是幹部名單換成那一塊要的形狀。
function pkPeople() { return UI.pkPeopleOf(S.people.filter(p => p.profile_id && p.role === "cadre")); }
function pkApply(el) {
  const ns = el.dataset.ns, d = S.wsDraft || {};
  if (ns === "wsn") S.wsDraft = Object.assign({}, d, { npk: UI.pkReduce(d.npk, pkPeople(), [], el), slug: val("wsn-slug"), title_zh: val("wsn-zh"), title_en: val("wsn-en"), owner: val("wsn-owner") });
  else S.wsDraft = Object.assign({}, d, { pk: UI.pkReduce(d.pk, pkPeople(), S.members.map(m => m.user_id), el) });
}
// 在多選那一塊裡按 Enter 就是按底下那顆「加 N 個人」（新增表單那一塊沒有那顆，Enter 不做事；空白鍵勾選是瀏覽器原生的）。
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const box = e.target.closest(".picker"); if (!box) return;
  const go = box.querySelector('[data-act="members-assign"],[data-act="ws-assign"]'); if (!go || go.disabled) return;
  e.preventDefault(); go.click();
});
