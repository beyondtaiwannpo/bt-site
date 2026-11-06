-- 內部表單：拿掉「匯入 Tally 的 CSV」　2026-11-30
--
-- Paul 2026-11-06：「I don't need an import a tally, I probably won't use that feature」，接著「Yes, remove it」。
-- 所以把 2026-11-29 加的兩支函式拿掉：
--   tf_import          把瀏覽器讀好的 CSV 列寫進一份表單
--   tf_link_response   把匯入的那一列接到某個幹部身上
-- 後台那顆按鈕與整個匯入畫面同一個 commit 拿掉了。
--
-- 沒動的：tf_responses 的 source 與 typed_name 兩欄留著（拿掉要改表，這兩欄空著不礙事，
-- 正式資料庫上沒有任何一列是匯入的，因為這個功能從來沒用過）。
-- 要在 2026-11-29-team-forms.sql 之後跑。重跑沒關係（drop ... if exists）。

begin;

drop function if exists public.tf_import(uuid, jsonb);
drop function if exists public.tf_link_response(uuid, uuid);

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('tf_import', 'tf_link_response')) as gone,
           (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
              and proname in ('tf_save_form', 'tf_set_audience', 'tf_set_status')
              and regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'not public\.tf_is_editor\(') as edit_gates,
           (select bool_and(not has_function_privilege('anon', p.oid, 'execute'))
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'tf\_%') as anon_no_fn,
           (select count(*) from public.tf_responses where source = 'import') as imported_rows
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when gone = 0 and edit_gates = 3 and anon_no_fn then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ tf_import 與 tf_link_response 不在了', '0', gone::text, case when gone = 0 then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 剩下三支改東西的函式還是先問 tf_is_editor', '3', edit_gates::text, case when edit_gates = 3 then 'PASS' else 'FAIL' end from t
  union all select 3, '★ anon 還是叫不到任何一支 tf_ 函式', 'true', anon_no_fn::text, case when anon_no_fn then 'PASS' else 'FAIL' end from t
  union all select 4, '（參考）之前匯入過的列，應該是 0', '0', imported_rows::text, case when imported_rows = 0 then 'PASS' else '看一下' end from t
) x order by ord;
