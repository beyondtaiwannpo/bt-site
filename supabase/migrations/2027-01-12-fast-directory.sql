-- 名錄變快：一千多個人的標籤一次算完，不再一個人算一次（2026-11-25）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 要先跑過 2027-01-06-labels-and-schools.sql（用到 rc_labels、rc_labels_of、rc_label_codes）。
--
-- Paul 2026-11-25：「when I am trying to load the directory of people and events, it runs really slowly. Every push or every reload
--   take about 10 seconds… I want it to be under a second to load out stuff.」
--
-- 量到的（正式站，Paul 的瀏覽器，2026-11-25）：rc_directory() 回 1250 個人、733 KB，一趟 7.6 秒。
-- 慢在哪：名錄每一個人都叫一次 rc_label_codes()，它裡面再叫 rc_labels_of()（一百行的查詢），
--   資料庫每叫一次就重新規劃一次那一百行，一千兩百五十個人就是一千兩百五十次。其他欄位加起來不到十分之一。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 新函式 rc_label_codes_all()：一次回「每一個人的標籤代號」（跟 rc_label_codes(那個人) 回的一模一樣，只是一次算全部）。
--      不看權限、不開給前端（跟 rc_labels_of 一樣），只有 rc_directory 自己守門之後才叫它。
--   2. rc_directory() 重寫一次。**回的東西一個字都沒變**（同樣的鍵、同樣的順序、同樣的門）。只改三個地方的算法：
--        標籤     改成跟 rc_label_codes_all() 接起來，不再一個人叫一次。
--        名字     原本每個人叫兩次 rc_person_name()，改成直接寫那一行（同一條規則：英文名先，沒有才中文名）。
--        能不能管 原本每個人問兩次 rc_can_manage()，改成整趟只問一次。
--
-- 沒有動的：
--   - 誰讀得到：門還是 rc_can_view()，讀不到名錄的人照舊拿到空的。沒登入的人叫不到。沒有新的表、沒有新的欄位、沒有動 RLS。
--   - 不公開的去向（private）照舊只有管得了紀錄的人看得到（countries、latest 那兩格）。
--   - 一個人的那一頁（rc_person）還是叫 rc_labels_of()，沒有動。標籤的規則只有一份寫在 rc_labels_of()，
--     這一支的 rc_label_codes_all() 是同一份規則的「一次算全部」版本，最後那張表會逐人對過兩邊一不一樣。
--
-- ⚠ 之後如果改了 rc_labels_of() 的規則（哪一種標籤怎麼算、現在還是不是），rc_label_codes_all() 要跟著改，
--   不然名錄上的標籤會跟一個人那一頁的不一樣。重跑這一支，第 2 列會告訴你有幾個人對不上。
-- ⚠ 之後如果重跑 2027-01-03-people-network.sql，要再跑一次這一支，不然 rc_directory 會被換回慢的那一版（資料不會錯，只是慢）。
-- ============================================================================

begin;

-- ---------- 1. 每一個人的標籤代號，一次算完 ----------
-- 規則照 2027-01-06-labels-and-schools.sql 的 rc_labels_of()，一條一條對著寫的：
--   有哪幾種：從紀錄算的八種（member、intern、student、mentee、mentor、speaker、volunteer、organizer）加 BT 給的（rc_labels）。
--   現在還是不是：學員看「現在還在念高中」那一格與畢業年；BT 寫了「到哪一年」就照那一年；不然照紀錄；只有 BT 給的當成現在還是。
--   代號：現在還是的就是標籤本身，不是的後面加 :past。順序跟 rc_labels_of 一樣。
-- 只回還在的人（forgotten_at 是空的）。沒有任何標籤的人不在結果裡（rc_directory 會補成 []）。
create or replace function public.rc_label_codes_all()
returns table (person_id uuid, codes jsonb)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with cur as (select (select id from public.terms where status = 'current' limit 1) as id, extract(year from now())::int as y),
  pe as (select p.id, p.kind, p.grad_year, pr.role as acct
           from public.people p left join public.profiles pr on pr.id = p.profile_id where p.forgotten_at is null),
  part as (select x.person_id,
                  bool_or(x.role = 'student') as st, bool_or(x.role = 'mentee') as me, bool_or(x.role = 'mentor') as mo,
                  bool_or(x.role = 'speaker') as sp, bool_or(x.role = 'volunteer') as vo, bool_or(x.role = 'organizer') as org,
                  bool_or(x.role = 'speaker' and e.starts_at >= now()) as sp_cur
             from public.rc_participation x join public.events e on e.id = x.event_id group by x.person_id),
  spk as (select s.person_id, bool_or(e.starts_at >= now()) as sp_cur
            from public.event_speakers s join public.events e on e.id = s.event_id where s.person_id is not null group by s.person_id),
  -- 一筆配對：mentor 那一邊算 mentor；mentee 那一邊算 mentee（同一個人兩邊都是的話只算 mentor，跟 rc_labels_of 一樣）。
  side as (select pr.mentor_id as person_id, 'mentor' as side, (pr.matched_on is not null and pr.ended_on is null and e.term_id = cur.id) as live
             from public.rc_pairs pr left join public.events e on e.id = pr.event_id cross join cur where pr.mentor_id is not null
           union all
           select pr.mentee_id, 'mentee', (pr.matched_on is not null and pr.ended_on is null and e.term_id = cur.id)
             from public.rc_pairs pr left join public.events e on e.id = pr.event_id cross join cur
            where pr.mentee_id is not null and pr.mentee_id is distinct from pr.mentor_id),
  prs as (select s.person_id, bool_or(s.side = 'mentor') as mo, bool_or(s.side = 'mentee') as me,
                 bool_or(s.side = 'mentor' and s.live) as mo_cur, bool_or(s.side = 'mentee' and s.live) as me_cur
            from side s group by s.person_id),
  pos as (select po.person_id, bool_or(po.term_id = cur.id) as now from public.positions po cross join cur group by po.person_id),
  -- 從紀錄算的：每個人、每一種，有沒有（has）與現在還是不是（live）。
  e as (
    select pe.id, pe.kind, pe.grad_year, v.label, v.has, v.live
      from pe
      left join part on part.person_id = pe.id
      left join spk on spk.person_id = pe.id
      left join prs on prs.person_id = pe.id
      left join pos on pos.person_id = pe.id
      cross join lateral (values
        ('member',    pos.person_id is not null or pe.kind = 'member' or coalesce(pe.acct in ('cadre', 'alumni'), false),
                      coalesce(pos.now, false) or coalesce(pe.acct = 'cadre', false)),
        ('intern',    coalesce(pe.acct = 'intern', false), true),
        ('student',   coalesce(part.st, false) or pe.kind = 'student', false),
        ('mentee',    coalesce(part.me, false) or coalesce(prs.me, false), coalesce(prs.me_cur, false)),
        ('mentor',    coalesce(part.mo, false) or coalesce(prs.mo, false), coalesce(prs.mo_cur, false)),
        ('speaker',   coalesce(part.sp, false) or spk.person_id is not null, coalesce(part.sp_cur, false) or coalesce(spk.sp_cur, false)),
        ('volunteer', coalesce(part.vo, false), false),
        ('organizer', coalesce(part.org, false), false),
        ('professor', false, false), ('admission_officer', false, false), ('connection', false, false)
      ) v(label, has, live)
  ),
  ords(label, ord) as (values ('member', 1), ('intern', 2), ('student', 3), ('mentee', 4), ('mentor', 5), ('speaker', 6), ('volunteer', 7), ('organizer', 8),
                              ('professor', 11), ('admission_officer', 12), ('connection', 13)),
  l as (
    select e.id, o.ord, e.label,
           case when e.label = 'student' then (e.kind = 'student' and (e.grad_year is null or e.grad_year >= cur.y)) and (g.until_year is null or g.until_year >= cur.y)
                when g.until_year is not null then g.until_year >= cur.y
                when e.has then e.live
                else true end as current
      from e join ords o on o.label = e.label
      left join public.rc_labels g on g.person_id = e.id and g.label = e.label
      cross join cur
     where e.has or g.label is not null
  )
  select l.id, jsonb_agg(l.label || case when l.current then '' else ':past' end order by l.ord) from l group by l.id;
$$;
revoke all on function public.rc_label_codes_all() from public, anon, authenticated;

-- ---------- 2. 名錄：回的東西跟 2027-01-03 那一版一模一樣，算法換掉三處 ----------
create or replace function public.rc_directory()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  with me as materialized (select public.rc_can_view() as can_view, public.rc_can_manage() as can_manage),
  lab as materialized (select c.person_id, c.codes from public.rc_label_codes_all() c where (select can_view from me)),
  rows as (
    select pe.id, pe.kind, pe.school, pe.grad_year, pe.profile_id, pr.role, pr.team,
           coalesce(nullif(trim(coalesce(pr.name_en, pe.name_en, '')), ''), nullif(trim(coalesce(pr.name_zh, pe.name_zh, '')), ''), '') as name,
           coalesce(pr.name_zh, pe.name_zh) as name_zh, coalesce(pr.name_en, pe.name_en) as name_en,
           pf.field, pf.job_title, pf.job_org, pf.city, pf.country, pf.photo_url, pf.offer_speak, pf.offer_mentor, pf.done_at, pf.rel_open,
           coalesce(lab.codes, '[]'::jsonb) as labels, me.can_manage
      from public.people pe
      cross join me
      left join public.profiles pr on pr.id = pe.profile_id
      left join public.rc_profiles pf on pf.person_id = pe.id
      left join lab on lab.person_id = pe.id
     where pe.forgotten_at is null and me.can_view
  )
  select case when (select can_view from me) then coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', pe.id,
             'name', pe.name,
             'name_zh', pe.name_zh,
             'name_en', pe.name_en,
             'kind', pe.kind,
             'labels', pe.labels,
             'field', coalesce(pe.field, ''), 'job_title', coalesce(pe.job_title, ''), 'job_org', coalesce(pe.job_org, ''),
             'city', coalesce(pe.city, ''), 'country_now', coalesce(pe.country, ''), 'photo_url', pe.photo_url,
             'offer_speak', coalesce(pe.offer_speak, false), 'offer_mentor', coalesce(pe.offer_mentor, false),
             'profile_done', pe.done_at is not null, 'rel_open', coalesce(pe.rel_open, 'unknown'),
             'role', pe.role,
             'team', pe.team,
             'school', pe.school,
             'grad_year', pe.grad_year,
             'schools', coalesce((select jsonb_agg(distinct s.school) from public.rc_schools s where s.person_id = pe.id), '[]'::jsonb),
             'aliases', coalesce((select jsonb_agg(distinct i.value) from public.rc_identities i where i.person_id = pe.id and i.kind in ('name_en', 'name_zh')
                           and lower(i.value) not in (lower(coalesce(pe.name_en, '')), lower(coalesce(pe.name_zh, '')))), '[]'::jsonb),
             'has_account', pe.profile_id is not null,
             'terms', coalesce((select jsonb_agg(distinct t) from (
                        select e.term_id as t from public.rc_participation x join public.events e on e.id = x.event_id where x.person_id = pe.id and e.term_id is not null
                        union select po.term_id from public.positions po where po.person_id = pe.id) z), '[]'::jsonb),
             'events', coalesce((select jsonb_agg(distinct x.event_id) from public.rc_participation x where x.person_id = pe.id), '[]'::jsonb),
             'roles', coalesce((select jsonb_agg(distinct x.role) from public.rc_participation x where x.person_id = pe.id), '[]'::jsonb),
             'countries', coalesce((select jsonb_agg(distinct o.country) from public.rc_outcomes o where o.person_id = pe.id and o.country <> '' and (o.visibility <> 'private' or pe.can_manage)), '[]'::jsonb),
             'latest', (select o.institution from public.rc_outcomes o where o.person_id = pe.id and (o.visibility <> 'private' or pe.can_manage) order by o.year desc nulls last, o.recorded_at desc limit 1),
             'n', (select count(*) from public.rc_participation x where x.person_id = pe.id)
           ) order by pe.name)
      from rows pe), '[]'::jsonb) else '[]'::jsonb end;
$$;
revoke all on function public.rc_directory() from public, anon;
grant execute on function public.rc_directory() to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select
      (select count(*)::int from public.people where forgotten_at is null) as people_n,
      -- 逐人對：一次算全部的那一份，跟一個人算一次的那一份（rc_label_codes，規則的正本）要一模一樣。
      (select count(*)::int from public.people p left join public.rc_label_codes_all() a on a.person_id = p.id
        where p.forgotten_at is null and coalesce(a.codes, '[]'::jsonb) is distinct from public.rc_label_codes(p.id)) as label_diff,
      (select count(*)::int from public.rc_label_codes_all() a join public.people p on p.id = a.person_id where p.forgotten_at is not null) as forgotten_in,
      (select body like '%rc_can_view()%' and body like '%pe.forgotten_at is null and me.can_view%' and body like '%then coalesce((%' and body like '%else ''[]''::jsonb end%'
         from fn where proname = 'rc_directory') as gate_ok,
      (select body like '%o.visibility <> ''private'' or pe.can_manage%' and body like '%rc_can_manage() as can_manage%' from fn where proname = 'rc_directory') as private_ok,
      (select body not like '%email%' and body not like '%rc_person_name(%' and body not like '%rc_label_codes(%' from fn where proname = 'rc_directory') as shape_ok,
      (select coalesce(array_agg(proname::text order by proname), '{}') from fn
        where proname in ('rc_directory', 'rc_label_codes_all') and has_function_privilege('anon', oid, 'execute')) as anon_fns,
      (select coalesce(array_agg(proname::text order by proname), '{}') from fn
        where proname in ('rc_directory', 'rc_label_codes_all') and has_function_privilege('authenticated', oid, 'execute')) as auth_fns,
      -- 在 SQL Editor 裡沒有登入的人，所以這裡拿到的一定是空的（門還在的證明）。
      jsonb_array_length(public.rc_directory()) as as_nobody,
      (select prosrc from pg_proc where proname = 'rc_labels_of' and pronamespace = 'public'::regnamespace) like '%''given'', given, ''earned'', earned%' as labels_of_untouched
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when label_diff = 0 and forgotten_in = 0 and gate_ok and private_ok and shape_ok and anon_fns = '{}' and auth_fns = array['rc_directory'] and as_nobody = 0 and labels_of_untouched
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '名錄上現在有幾個人（只是告訴你數字）', '', people_n::text, 'INFO' from t
  union all select 2, '★ 每一個人的標籤：一次算全部的，跟原本一個人算一次的一模一樣（對不上的人數）', '0', label_diff::text, case when label_diff = 0 then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 被移除的人不在一次算全部的那一份裡', '0', forgotten_in::text, case when forgotten_in = 0 then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 名錄的門還是 rc_can_view，讀不到的人拿到空的', 'true', coalesce(gate_ok, false)::text, case when gate_ok then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 不公開的去向照舊只有管得了紀錄的人看得到', 'true', coalesce(private_ok, false)::text, case when private_ok then 'PASS' else 'FAIL' end from t
  union all select 6, '名錄沒有 email，也不再一個人叫一次名字與標籤', 'true', coalesce(shape_ok, false)::text, case when shape_ok then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 這兩支沒登入都叫不到', '{}', anon_fns::text, case when anon_fns = '{}' then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 登入的人只叫得到 rc_directory（一次算全部的那一支不開給前端）', '{rc_directory}', auth_fns::text, case when auth_fns = array['rc_directory'] then 'PASS' else 'FAIL' end from t
  union all select 9, '★ 沒有登入的人（這個視窗）拿到幾個人', '0', as_nobody::text, case when as_nobody = 0 then 'PASS' else 'FAIL' end from t
  union all select 10, '一個人那一頁的標籤規則（rc_labels_of）沒被動到', 'true', coalesce(labels_of_untouched, false)::text, case when labels_of_untouched then 'PASS' else 'FAIL' end from t
) x order by ord;
