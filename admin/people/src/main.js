// 後台「人與權限」那一組的邏輯：邀請碼。職位與 team 的改動是批 3 的事。
// 2026-10-15 從 admin/src/main.js 原樣搬過來（後台拆成四個資料夾，見 README「後台的四個資料夾」）。
//
// 狀態只有一個 S，畫面只從 S 產生。**不在事件處理裡直接改 DOM**，一律改 S 再 render()。
import * as AUTH from "../../../shared/auth.js";
import { navHTML } from "../../../shared/nav.js";
import * as D from "./data.js";
import * as UI from "./ui.js";

const HERE = "/admin/people/";

let S = {
  user: null, me: null, down: false, busy: false, msg: "",
  view: "roster",          // roster | person | invites
  // 一定要有初始值：載入失敗之後再 render 一次不能整頁空白。
  invites: [], inviteDraft: null,
  // 幹部名單（2026-10-21，批 3）
  roster: [], changes: [], privileged: [], person: null, personDraft: null,
  // 名單的 team 篩選（2026-10-19）："" 全部、"__none" 還沒填 team、其他是 team 名。
  rosterTeam: "",
};

const root = () => document.getElementById("bt-root");
// **這只是畫面。真正的門在資料庫：invite_codes_for_review()、create_invite()、disable_invite()
// 第一句都問 is_president()。** Director 硬打網址進來看到的是 noAccessHTML，按不到任何東西。
const isPres = () => !!S.me && S.me.board === "president";

function render() {
  const el = root();
  if (!el) return;
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";

  if (S.down) { el.innerHTML = UI.shellHTML(nav, "", UI.downHTML()); return; }
  if (!S.user) { location.replace("../../app/?next=admin-people"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.shellHTML(nav, "", UI.notCadreHTML()); return; }
  if (!isPres()) { el.innerHTML = UI.shellHTML(nav, UI.railHTML("people", "", S.me), UI.noAccessHTML(S.me)); return; }

  let body;
  if (S.view === "invites") body = UI.inviteCodesHTML(S.invites, S.msg, S.busy, S.inviteDraft);
  else if (S.view === "person" && S.person) body = UI.personEditHTML(S.person, S.privileged, S.user.id, S.msg, S.busy, S.personDraft);
  else if (S.view === "changes") body = UI.changesHTML(S.changes, S.roster, S.msg);
  else body = UI.rosterHTML(S.roster, S.changes, S.privileged, S.user.id, S.msg, S.busy, S.rosterTeam);
  const tab = S.view === "invites" ? "invites" : S.view === "changes" ? "changes" : "roster";
  el.innerHTML = UI.shellHTML(nav, UI.railHTML("people", tab, S.me), body);
}

async function boot() {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { render(); return; }
    S.me = await D.loadMe(S.user.id);
    if (!S.me || S.me.role !== "cadre" || !isPres()) { render(); return; }
    // ?tab=invites 直接開邀請碼（README 的連結用得到）。
    const want = location.hash.slice(1) || new URLSearchParams(location.search).get("tab");
    if (want === "invites") await openInvites();
    else if (want === "changes") await openRoster(false, "changes");
    else await openRoster();
  } catch (e) {
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../../app/?next=admin-people"); return; }
    console.error(HERE + " 載入失敗：", e);
    S.down = true; render();
  }
}

// 邀請碼與使用紀錄。只讀，只有 Co-President 拿得到（門在資料庫那一支函式裡）。
async function openInvites() {
  S.busy = true; render();
  try {
    S.invites = await D.loadInvites();
    if (!S.inviteDraft) S.inviteDraft = { code: UI.suggestCode(), grants: "cadre", uses: 1, note: "" };
    S.view = "invites"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = "邀請碼載不到：" + D.says(e); }
  render();
}

// 幹部名單、變動紀錄、會長出權限的 team。三個查詢一起發。
// 紀錄與 team 清單載不到不該讓名單打不開（遷移檔還沒跑的時候），所以各自接住。
// view 預設 "roster"，變動紀錄那一頁讀同一份資料，只是開在另一個畫面。
async function openRoster(keepMsg, view) {
  S.busy = true; if (!keepMsg) S.msg = ""; render();
  try {
    const [roster, changes, privileged] = await Promise.all([
      D.loadRoster(),
      D.loadRoleChanges().catch(e => { S.msg = "變動紀錄載不到：" + D.says(e); return []; }),
      D.loadPrivilegedTeams().catch(() => [{ name: "Internship Team" }]),
    ]);
    S.roster = roster; S.changes = changes; S.privileged = privileged;
    S.view = view || "roster"; S.busy = false;
  } catch (e) { S.busy = false; S.msg = "名單載不到：" + D.says(e); S.view = "roster"; }
  render();
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;

  if (act === "retry") { location.reload(); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../../app/"); return; }
  if (act === "tab") {
    e.preventDefault(); S.msg = "";
    history.replaceState(null, "", "#" + b.dataset.t);
    if (b.dataset.t === "invites") await openInvites();
    else if (b.dataset.t === "changes") await openRoster(false, "changes");
    else await openRoster();
    return;
  }
  if (act === "roster-team") { S.rosterTeam = b.dataset.team || ""; render(); return; }

  // ── 幹部名單（2026-10-21，批 3）────────────────────────────────────
  if (act === "roster-back") { await openRoster(); return; }
  if (act === "person-edit") {
    const p = S.roster.find(x => x.id === b.dataset.id);
    if (!p) { S.msg = "找不到這個人，重新整理再試一次。"; render(); return; }
    S.person = p; S.personDraft = null; S.view = "person"; S.msg = ""; render(); return;
  }
  if (act === "person-save") {
    const p = S.roster.find(x => x.id === b.dataset.id);
    if (!p) { S.msg = "找不到這個人，重新整理再試一次。"; render(); return; }
    const roleEl = document.getElementById("pk-role");
    const role = roleEl && !roleEl.disabled ? roleEl.value : p.board_role;
    const team = [...document.querySelectorAll('input[name="team"]:checked')].map(x => x.value.trim()).filter(Boolean).join(", ");
    S.personDraft = { board_role: role, team };
    const roleChanged = role !== (p.board_role || "member");
    const teamChanged = UI.parseTeams(team).join("|") !== UI.parseTeams(p.team).join("|");
    if (!roleChanged && !teamChanged) { S.msg = "沒有改到任何東西。"; render(); return; }
    // ⚠ 升成 Co-President 等於把整個後台給他，包括把你降級。畫面多問一次，資料庫那一側刻意不擋（換屆要用）。
    if (roleChanged && role === "president" &&
        !confirm(`把「${UI.namesOf(p).name}」升成 Co-President？\n\n他會拿到跟你一樣的全部權限，包括發邀請碼、改別人的職位、把你降級。這一筆會記在變動紀錄裡。`)) return;
    S.busy = true; S.msg = ""; render();
    const done = [];
    try {
      if (roleChanged) { await D.setBoardRole(p.id, role); done.push(`職位改成${UI.boardLabel(role)}`); }
      if (teamChanged) { await D.setTeam(p.id, team); done.push(`team 改成${team || "（沒有）"}`); }
      S.personDraft = null;
      S.msg = `「${UI.namesOf(p).name}」${done.join("、")}。已經記進變動紀錄。`;
      await openRoster(true);
    } catch (err) {
      // 職位改好了但 team 沒改到（或反過來）要講清楚，不然他會把改好的那一半再改一次。
      S.busy = false;
      S.msg = (done.length ? done.join("、") + "存好了，但後面那一步" : "") + "存不起來：" + D.says(err);
      render();
    }
    return;
  }

  // ── 邀請碼的新增與停用（2026-10-14）────────────────────────────────
  if (act === "invite-suggest" || act === "invite-new") {
    const val = i => { const el = document.getElementById(i); return el ? el.value.trim() : ""; };
    S.inviteDraft = { code: val("ic-code"), grants: val("ic-grants") || "cadre",
                      uses: val("ic-uses") || "1", note: val("ic-note") };
    if (act === "invite-suggest") { S.inviteDraft.code = UI.suggestCode(); render(); return; }
    if (!S.inviteDraft.code) { S.msg = "碼要填。"; render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const made = await D.createInvite(S.inviteDraft.code, S.inviteDraft.grants,
                                        S.inviteDraft.uses, S.inviteDraft.note);
      S.invites = await D.loadInvites();
      S.inviteDraft = { code: UI.suggestCode(), grants: S.inviteDraft.grants, uses: 1, note: "" };
      S.busy = false; S.msg = `建好了：${made}。用複製貼上的方式給對方，不要口頭念。`;
    } catch (err) { S.busy = false; S.msg = "建不起來：" + D.says(err); }
    render();
    return;
  }
  if (act === "invite-disable") {
    const code = b.dataset.code;
    if (!confirm(`停用「${code}」？\n\n停用之後這組碼就不能再用了。後台沒有恢復的按鈕，要恢復得到 Supabase 改。`)) return;
    S.busy = true; S.msg = ""; render();
    try {
      await D.disableInvite(code);
      S.invites = await D.loadInvites();
      S.busy = false; S.msg = `「${code}」已經停用。`;
    } catch (err) { S.busy = false; S.msg = "停用不了：" + D.says(err); }
    render();
    return;
  }

});

boot();
