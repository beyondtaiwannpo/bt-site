// /apply/ 的邏輯。
//
// ⚠ **這一頁沒登入也要看得起來。** 它是對外頁面，路人從 IG 進來就該看到
// 現在開放什麼。登入只擋在「送出」那一步。
// 所以 boot() 裡任何跟登入有關的失敗都不能讓整頁停住。
import { supabase } from "../../shared/supabase.js";
import * as AUTH from "../../shared/auth.js";
import * as UI from "./ui.js";

let S = {
  forms: [], form: null, questions: [],
  user: null, profileOk: false, applied: false,
  view: "list", msg: "", busy: false, ready: false,
};

const root = () => document.getElementById("ap-root");
// 語言跟著整頁的 data-lang 走（那是 <head> 裡就決定好的，見對外頁的註解）。
// **不要在這裡再判斷一次瀏覽器語言** —— 判斷兩次就會有一個地方沒改到。
const isEn = () => document.documentElement.getAttribute("data-lang") === "en";

function state() {
  if (S.applied) return "already";
  if (!S.user) return "needIn";
  if (!S.profileOk) return "needProfile";
  return "signedIn";
}

function render() {
  const el = root();
  if (!el) return;
  if (!S.ready) return;
  if (S.view === "done") { el.innerHTML = UI.doneHTML(isEn()); return; }
  if (S.view === "error") { el.innerHTML = UI.errorHTML(S.msg); return; }
  if (S.view === "form" && S.form) {
    el.innerHTML = UI.formHTML(S.form, S.questions, state(), S.msg, S.busy, isEn());
    return;
  }
  el.innerHTML = UI.listHTML(S.forms, isEn());
}

const formId = () => new URLSearchParams(location.search).get("f");

async function boot() {
  try {
    // 誰進來都讀得到開放中的表單（RLS 只放行 status = 'open'）。
    // 這一句不需要登入，也不該因為沒登入而失敗。
    const { data, error } = await supabase
      .from("forms")
      .select("id, kind, title, intro, closes_at, notify_by, lang, opens_at")
      .eq("status", "open")
      .order("closes_at", { ascending: true, nullsFirst: false });
    if (error) throw error;
    const now = Date.now();
    // 開放時間還沒到的先不顯示。**資料庫那邊也擋著**（submit_application 會拒），
    // 這裡擋是為了不要畫出一顆按了會失敗的按鈕。
    S.forms = (data || []).filter(f =>
      (!f.opens_at || new Date(f.opens_at).getTime() <= now) &&
      (!f.closes_at || new Date(f.closes_at).getTime() >= now));

    // 登入狀態是**加分項**，拿不到就當沒登入，不要讓整頁掛掉。
    try {
      const who = await AUTH.currentUserDetailed();
      S.user = who.offline ? null : who.user;
      if (S.user) {
        const { data: p } = await supabase.from("profiles")
          .select("name_zh, name_en, school, grade").eq("id", S.user.id).maybeSingle();
        S.profileOk = !!(p && (p.name_zh || p.name_en) && p.school && p.grade);
      }
    } catch (e) { console.warn("讀不到登入狀態，當成沒登入。", e); }

    const id = formId();
    if (id) await openForm(id);
    S.ready = true;
    render();
  } catch (e) {
    console.error("/apply/ 載入失敗：", e);
    S.ready = true;
    S.view = "error";
    S.msg = isEn()
      ? "We cannot reach the database right now. Please try again later, or write to beyondtaiwan2020@gmail.com."
      : "現在連不上資料庫，等一下再試一次，或是寄信到 beyondtaiwan2020@gmail.com。";
    render();
  }
}

async function openForm(id) {
  const f = S.forms.find(x => x.id === id);
  if (!f) {
    S.view = "error";
    S.msg = isEn() ? "That application is not open any more."
                   : "這一份申請已經不開放了。";
    return;
  }
  const { data: qs, error } = await supabase
    .from("form_questions").select("id, label, help, type, required, options")
    .eq("form_id", id).order("ord");
  if (error) throw error;
  S.form = f; S.questions = qs || []; S.view = "form"; S.msg = "";

  // 已經送過了嗎。RLS 讓他只讀得到自己那一筆，所以這一句對別人是空的。
  S.applied = false;
  if (S.user) {
    const { data: a } = await supabase.from("applications")
      .select("id").eq("form_id", id).eq("user_id", S.user.id).maybeSingle();
    S.applied = !!a;
  }
}

// 把畫面上填的東西讀成 submit_application 要的形狀。
function readAnswers() {
  return S.questions.map(q => {
    if (q.type === "single" || q.type === "multi") {
      const picked = [...document.querySelectorAll(`input[name="o-${CSS.escape(q.id)}"]:checked`)]
        .map(i => i.value);
      // 多選存成換行分隔的字串（見 application_answers.value 的欄位註解）。
      return { q: q.id, v: picked.join("\n") };
    }
    const el = document.getElementById("q-" + q.id);
    return { q: q.id, v: el ? el.value.trim() : "" };
  });
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;

  if (act === "back") {
    // 回清單。**用 pushState 不用 location** —— 整頁重載會再打一次資料庫，
    // 而清單已經在手上了。
    history.pushState({}, "", location.pathname + (isEn() ? "?lang=en" : "?lang=zh"));
    S.view = "list"; S.form = null; S.msg = ""; render();
    return;
  }

  if (act === "signin" ) {
    // 登入完帶他回這一份表單。next 的白名單與存放方式在 app/src/nav.js，
    // 這裡只負責把去處寫進網址。
    const back = location.pathname + location.search;
    location.href = "../app/?next=" + encodeURIComponent(back);
    return;
  }

  if (act === "submit") {
    const answers = readAnswers();
    // 前端先檢查必填，讓他當下就看到哪一題沒填。
    // **伺服器那一端也檢查一次**（submit_application），這裡不是門。
    const miss = S.questions.filter(q => q.required &&
      !answers.find(a => a.q === q.id && a.v)).map(q => q.label);
    if (miss.length) {
      S.msg = (isEn() ? "Still missing: " : "這幾題還沒填：") + miss.join("、");
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const guard = document.getElementById("guard");
    S.busy = true; S.msg = ""; render();
    try {
      const { error } = await supabase.rpc("submit_application", {
        p_form_id: S.form.id,
        p_answers: answers,
        p_guardian_email: guard ? guard.value.trim() : null,
      });
      if (error) throw error;
      S.busy = false; S.view = "done"; render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      // ⚠ 失敗一定要說話。送出失敗卻畫出一模一樣的畫面，他會再按一次、
      // 按五次、然後關掉（看板那一輪學到的同一件事）。
      S.busy = false;
      const m = String((err && err.message) || err);
      S.msg = m.startsWith("missing:")
        ? (isEn() ? "Still missing: " : "這幾題還沒填：") + m.slice(8)
        : m.includes("form_closed")
          ? (isEn() ? "This application has just closed." : "這一份申請剛剛關閉了。")
          : (isEn() ? "Could not send: " : "送不出去：") + m;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    return;
  }
});

// 語言按鈕會改 data-lang，但這一區的字是 JavaScript 畫的，不會自己跟著換。
// 監看那個屬性，改了就重畫。
new MutationObserver(() => render())
  .observe(document.documentElement, { attributes: true, attributeFilter: ["data-lang"] });

window.addEventListener("popstate", () => {
  const id = formId();
  if (!id) { S.view = "list"; S.form = null; render(); }
});

boot();
