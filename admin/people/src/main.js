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
  filter: { term: null, team: "" },       // term 為 null 表示「這一屆」（rosterHTML 自己找 current）
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

  if (S.down) { el.innerHTML = UI.shellHTML(nav, "", UI.downHTML()); return; }
  if (!S.user) { location.replace("../../app/?next=admin-people"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.shellHTML(nav, "", UI.notCadreHTML()); return; }
  if (!isSenior()) { el.innerHTML = UI.shellHTML(nav, UI.railHTML("people", "", S.me), UI.noAccessHTML(S.me)); return; }

  const filter = { term: S.filter.term || (UI.currentTerm(S.terms) || {}).id || "all", team: S.filter.team };
  let body, tab = "roster";
  if (S.view === "invites") { body = UI.inviteCodesHTML(S.invites, S.msg, S.busy, S.inviteDraft); tab = "invites"; }
  else if (S.view === "changes") { body = UI.changesHTML(S.changes, S.people, S.msg); tab = "changes"; }
  else if (S.view === "workspaces") { body = UI.workspacesHTML(S.workspaces, S.wsSel, S.members, S.people, S.msg, S.busy, S.wsDraft, isSenior()); tab = "workspaces"; }
  else if (S.view === "terms") { body = UI.termsHTML(S.terms, S.people, S.user.id, isPres(), S.msg, S.busy, S.termDraft, S.end); tab = "terms"; }
  else if (S.view === "person-new") body = UI.personNewHTML(S.terms, S.msg, S.busy, S.newDraft);
  else if (S.view === "person" && S.person) body = UI.personEditHTML(S.person, S.terms, S.user.id, isPres(), S.msg, S.busy, S.personDraft, S.people, S.remove);
  else body = UI.rosterHTML(S.people, S.terms, S.user.id, isPres(), S.msg, S.busy, filter);
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("people", tab, S.me), body);
}

async function boot() {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
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
    S.down = true; render();
  }
}

async function openTab(key, ws) {
  if (key === "invites") return openInvites();
  if (key === "changes") return openRoster(false, "changes");
  if (key === "workspaces") return openWorkspaces(ws);
  if (key === "terms") return openTerms();
  return openRoster();
}

// 名單、屆別、變動紀錄三個查詢一起發。紀錄載不到不該讓名單打不開（遷移檔還沒跑的時候），各自接住。
async function loadCore(keepMsg) {
  if (!keepMsg) S.msg = "";
  const [people, terms, changes] = await Promise.all([
    D.loadPeople(),
    D.loadTerms().catch(e => { S.msg = T("err.termsLoad") + D.says(e); return []; }),
    D.loadRoleChanges().catch(e => { S.msg = T("err.changesLoad") + D.says(e); return []; }),
  ]);
  S.people = people || []; S.terms = terms; S.changes = changes;
  if (S.person) S.person = findPerson(S.person.person_id) || null;
}
async function openRoster(keepMsg, view) {
  S.busy = true; render();
  try { await loadCore(keepMsg); S.view = view || "roster"; S.busy = false; }
  catch (e) { S.busy = false; S.msg = T("err.rosterLoad") + D.says(e); S.view = "roster"; }
  render();
}
async function openInvites() {
  S.busy = true; render();
  try {
    S.invites = await D.loadInvites();
    if (!S.inviteDraft) S.inviteDraft = { code: UI.suggestCode(), grants: "cadre", uses: 1, note: "" };
    S.view = "invites"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = T("err.invitesLoad") + D.says(e); }
  render();
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
}
async function run(label, fn) {
  S.busy = true; S.msg = ""; render();
  try { return await fn(); }
  catch (err) { S.busy = false; S.msg = T(label) + D.says(err); render(); return undefined; }
}

// 改一個人那一頁的表單值。只讀畫面上開著的欄位；關著的（自己的職級、Senior Adviser 看到的名字）照原值。
function readPersonForm(p) {
  const roleEl = document.getElementById("pk-role");
  const termId = val("pk-term") || (S.personDraft && S.personDraft.term) || (UI.currentTerm(S.terms) || {}).id || "";
  const pos = UI.positionFor(p, termId) || {};
  return {
    board_role: roleEl && !roleEl.disabled ? roleEl.value : (p.board_role || "member"),
    name_zh: document.getElementById("pk-zh") && !document.getElementById("pk-zh").disabled ? val("pk-zh") : (p.name_zh || ""),
    name_en: document.getElementById("pk-en") && !document.getElementById("pk-en").disabled ? val("pk-en") : (p.name_en || ""),
    term: termId,
    title_zh: document.getElementById("pk-tzh") ? val("pk-tzh") : (pos.title_zh || ""),
    title_en: document.getElementById("pk-ten") ? val("pk-ten") : (pos.title_en || ""),
    pteam: document.getElementById("pk-pteam") ? val("pk-pteam") : (pos.team || ""),
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
  if (act === "lang") { switchLang(b.dataset.lang); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../../app/"); return; }
  if (act === "tab") {
    e.preventDefault(); S.msg = "";
    history.replaceState(null, "", "#" + b.dataset.t);
    await openTab(b.dataset.t, b.dataset.ws);
    return;
  }
  if (act === "roster-term") { S.filter.term = b.dataset.v || "all"; render(); return; }
  if (act === "roster-team") { S.filter.team = b.dataset.v || ""; render(); return; }
  if (act === "roster-back") { S.person = null; S.personDraft = null; S.remove = null; S.newDraft = null; await openRoster(); return; }

  // ── 一個人 ──────────────────────────────────────────────────────────
  if (act === "person-edit") {
    const p = findPerson(b.dataset.id);
    if (!p) { S.msg = T("err.noPerson"); render(); return; }
    S.person = p; S.personDraft = null; S.remove = null; S.view = "person"; S.msg = ""; render(); return;
  }
  if (act === "person-save") {
    const p = findPerson(b.dataset.id);
    if (!p) { S.msg = T("err.noPerson"); render(); return; }
    const f = readPersonForm(p);
    S.personDraft = f;
    const cadre = !!p.profile_id && p.role === "cadre";
    const pos = UI.positionFor(p, f.term) || {};
    const roleChanged = cadre && f.board_role !== (p.board_role || "member");
    const nameChanged = f.name_zh !== (p.name_zh || "") || f.name_en !== (p.name_en || "");
    const posChanged = f.title_zh !== (pos.title_zh || "") || f.title_en !== (pos.title_en || "") || f.pteam !== (pos.team || "");
    const teamChanged = cadre && UI.parseTeams(f.team).join("|") !== UI.parseTeams(p.team).join("|");
    if (!roleChanged && !nameChanged && !posChanged && !teamChanged) { S.msg = T("err.nothingChanged"); render(); return; }
    if (nameChanged && !f.name_zh && !f.name_en) { S.msg = T("err.nameRequired"); render(); return; }
    if (posChanged && !f.title_zh && !f.title_en) { S.msg = T("err.titleRequired"); render(); return; }
    // ⚠ 升成 Co-President 等於把整個後台給他，包括把你降級。畫面多問一次，資料庫那一側刻意不擋（換屆要用）。
    if (roleChanged && f.board_role === "president" && !confirm(T("confirm.promote", { name: pname(p) }))) return;
    S.busy = true; S.msg = ""; render();
    const done = [];
    try {
      if (roleChanged) { await D.setBoardRole(p.profile_id, f.board_role); done.push(T("msg.roleTo", { role: UI.boardLabel(f.board_role) })); }
      if (nameChanged) { await D.renamePerson(p.person_id, f.name_zh, f.name_en); done.push(T("msg.nameTo", { name: f.name_zh || f.name_en })); }
      if (posChanged) { await D.setPosition(p.person_id, f.term, f.title_zh, f.title_en, f.pteam); done.push(T("msg.positionTo", { term: f.term, title: f.title_en || f.title_zh })); }
      if (teamChanged) { await D.setTeam(p.profile_id, f.team); done.push(T("msg.teamTo", { team: f.team || T("value.none") })); }
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
    if (!confirm(T("confirm.deletePosition", { term: b.dataset.term }))) return;
    const ok = await run("err.save", () => D.deletePosition(p.person_id, b.dataset.term));
    if (ok !== undefined) await reopenPerson(p.person_id, T("msg.personSaved", { name: pname(p), done: T("msg.positionGone", { term: b.dataset.term }) }));
    return;
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
    if (!confirm(T("confirm.deleteRecord", { name: pname(p) }))) return;
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
    if (!confirm(T("confirm.merge", { keep: pname(keep), drop: pname(drop) }))) return;
    const ok = await run("err.merge", () => D.mergePeople(keep.person_id, drop.person_id));
    if (ok !== undefined) await reopenPerson(keep.person_id, T("msg.merged"));
    return;
  }
  if (act === "person-new") { S.newDraft = null; S.view = "person-new"; S.msg = ""; render(); return; }
  if (act === "person-create") {
    const d = { name_zh: val("pn-zh"), name_en: val("pn-en"), term: val("pn-term"), title_en: val("pn-ten"), title_zh: val("pn-tzh"), pteam: val("pn-pteam"), note: val("pn-note") };
    S.newDraft = d;
    if (!d.name_zh && !d.name_en) { S.msg = T("err.nameRequired"); render(); return; }
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
  if (act === "ws-pick") { e.preventDefault(); S.wsDraft = null; await openWorkspaces(b.dataset.ws); return; }
  if (act === "ws-assign") {
    const person = val("ws-person"), level = val("ws-levelnew") || "view";
    S.wsDraft = { person, level };
    if (!person) { S.msg = T("err.pickPerson"); render(); return; }
    const p = S.people.find(x => x.profile_id === person);
    const ok = await run("err.assign", () => D.assign(person, b.dataset.ws, level));
    if (ok !== undefined) { S.wsDraft = null; S.msg = T("msg.assigned", { name: p ? pname(p) : "", ws: b.dataset.ws, level: UI.levelLabel(level) }); await openWorkspaces(null, true); }
    return;
  }
  if (act === "ws-unassign") {
    const p = S.people.find(x => x.profile_id === b.dataset.id);
    if (!confirm(T("confirm.unassign", { name: p ? pname(p) : "", ws: S.wsSel }))) return;
    const ok = await run("err.unassign", () => D.unassign(b.dataset.id, S.wsSel));
    if (ok !== undefined) { S.msg = T("msg.unassigned", { name: p ? pname(p) : "", ws: S.wsSel }); await openWorkspaces(null, true); }
    return;
  }
  if (act === "ws-create") {
    const d = { slug: val("wsn-slug"), title_zh: val("wsn-zh"), title_en: val("wsn-en"), owner: val("wsn-owner") };
    S.wsDraft = d;
    const id = await run("err.createWs", () => D.createWorkspace(d.slug, d.title_zh, d.title_en, d.owner || null));
    if (id !== undefined) { S.wsDraft = null; S.msg = T("msg.wsCreated", { id }); await openWorkspaces(id, true); }
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
      S.filter.term = null;
      await openRoster(true);
    }
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
    if (!confirm(T("confirm.disableCode", { code }))) return;
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
  if (el.dataset.act === "person-term" && S.person) {
    const f = readPersonForm(S.person);
    const pos = UI.positionFor(S.person, f.term) || {};
    S.personDraft = Object.assign(f, { title_zh: pos.title_zh || "", title_en: pos.title_en || "", pteam: pos.team || "" });
    render(); return;
  }
  if (el.dataset.act === "ws-level" && S.wsSel) {
    const p = S.people.find(x => x.profile_id === el.dataset.id);
    const level = el.value;
    const ok = await run("err.assign", () => D.assign(el.dataset.id, S.wsSel, level));
    if (ok !== undefined) { S.msg = T("msg.assigned", { name: p ? pname(p) : "", ws: S.wsSel, level: UI.levelLabel(level) }); await openWorkspaces(null, true); }
  }
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
