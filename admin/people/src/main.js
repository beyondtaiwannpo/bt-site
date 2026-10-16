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
  view: "invites",
  // 一定要有初始值：載入失敗之後再 render 一次不能整頁空白。
  invites: [], inviteDraft: null,
};

const root = () => document.getElementById("bt-root");
// **這只是畫面。真正的門在資料庫：invite_codes_for_review()、create_invite()、disable_invite()
// 第一句都問 is_president()。** Director 硬打網址進來看到的是 noAccessHTML，按不到任何東西。
const isPres = () => !!S.me && S.me.board === "president";

function render() {
  const el = root();
  if (!el) return;
  const nav = S.me ? navHTML({ current: "admin", role: S.me.role, name: S.me.name }) : "";

  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.user) { location.replace("../../app/?next=admin-people"); return; }
  if (!S.me || S.me.role !== "cadre") { el.innerHTML = UI.notCadreHTML(); return; }
  if (!isPres()) { el.innerHTML = nav + UI.noAccessHTML(S.me); return; }

  const body = UI.inviteCodesHTML(S.invites, S.msg, S.busy, S.inviteDraft);
  el.innerHTML = nav + UI.groupBarHTML("people", S.me) + body;
}

async function boot() {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { render(); return; }
    S.me = await D.loadMe(S.user.id);
    if (!S.me || S.me.role !== "cadre" || !isPres()) { render(); return; }
    await openInvites();
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

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;

  if (act === "retry") { location.reload(); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../../app/"); return; }
  if (act === "tab") { S.msg = ""; await openInvites(); return; }

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
