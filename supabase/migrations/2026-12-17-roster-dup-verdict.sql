-- 2026-12-17：名單（People → 名單）的「可能是同一個人」改用 Records 的判斷（Paul 2026-11-13：
-- 「Why are there possible duplicate at our roster while there's nothing at the people?」）。
-- 原本 roster() 的 maybe_dup 只看英文名一樣，不看 email、中文名、學校，也不管「說過不是同一個人」；Records 的
-- rc_duplicates() 從 2026-12-09 起會先比過（rc_dup_verdict），判成兩個人的不放上卡。所以同一對人 Records 說不是、名單說可能是。
-- 這一支只重新定義 roster()，回傳欄位一個都沒變，多兩個條件：
--   1. rc_not_same 裡有的那一對（有人按過「不是同一個人」）不標。
--   2. rc_dup_verdict() 判成 different 的那一對不標。判成 same 或 unsure 的照舊標。
-- 依賴：2026-12-01-records.sql（roster() 只列成員、rc_not_same）、2026-12-09-records-dedupe-verdict.sql（rc_dup_verdict）。
-- 不改表、不動資料，可以重跑。最後印一張驗收表。
begin;

create or replace function public.roster()
returns table (
  person_id uuid, profile_id uuid, name_zh text, name_en text, role text, board_role text, team text,
  positions jsonb, workspaces jsonb, note text, pending_code text, maybe_dup uuid[]
) language sql stable security definer
set search_path = public, pg_temp
as $$
  select pe.id, pe.profile_id,
         coalesce(pr.name_zh, pe.name_zh), coalesce(pr.name_en, pe.name_en),
         pr.role, pr.board_role, pr.team,
         coalesce((select jsonb_agg(jsonb_build_object('term', po.term_id, 'title_zh', po.title_zh, 'title_en', po.title_en, 'team', po.team)
                                    order by t.starts_on desc)
                     from positions po join terms t on t.id = po.term_id where po.person_id = pe.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('id', a.workspace_id, 'level', a.level) order by a.workspace_id)
                     from assignments a where a.user_id = pe.profile_id), '[]'::jsonb),
         pe.note,
         (select c.code from invite_codes c where c.person_id = pe.id and c.uses_left > 0 and c.email is null and c.revoked_at is null limit 1),
         (select array_agg(o.id) from people o
           where o.id <> pe.id and o.kind = 'member' and pe.name_en is not null and lower(o.name_en) = lower(pe.name_en)
             -- 2026-12-17：跟 Records 的「可能重複」同一套判斷。說過不是同一個人的、系統比過判成兩個人的，都不標。
             and not exists (select 1 from rc_not_same n where n.a = least(pe.id, o.id) and n.b = greatest(pe.id, o.id))
             and coalesce(public.rc_dup_verdict(pe.id, o.id)->>'verdict', 'unsure') <> 'different')
    from people pe left join profiles pr on pr.id = pe.profile_id
   where public.is_senior() and pe.kind = 'member'
   order by (pr.role = 'cadre') desc nulls last, pr.board_role, coalesce(pr.name_en, pe.name_en);
$$;


revoke all on function public.roster() from public, anon;
grant execute on function public.roster() to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace and proname = 'roster'),
  t as (
    select (select body like '%rc_not_same%' from fn) as not_same,
           (select body like '%rc_dup_verdict(pe.id, o.id)%' and body like '%<> ''different''%' from fn) as verdict,
           (select body like '%pe.kind = ''member''%' and body like '%is_senior()%' from fn) as still_members,
           (select not has_function_privilege('anon', 'public.roster()', 'execute')) as anon_out
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when not_same and verdict and still_members and anon_out then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '說過不是同一個人的不標', 'true', not_same::text, case when not_same then 'PASS' else 'FAIL' end from t
  union all select 2, '系統判成兩個人的不標（跟 Records 同一套）', 'true', verdict::text, case when verdict then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 還是只列成員、只有 Co-President 與 Senior Adviser', 'true', still_members::text, case when still_members then 'PASS' else 'FAIL' end from t
  union all select 4, '★ anon 叫不到', 'true', anon_out::text, case when anon_out then 'PASS' else 'FAIL' end from t
) x order by ord;
