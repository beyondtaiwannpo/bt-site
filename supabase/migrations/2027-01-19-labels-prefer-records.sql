-- 標籤：有真的紀錄了，就不再看舊資料庫留下來的那一句（2026-11-26）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2027-01-16-member-label-rule.sql**（這一支是照那一版的兩支函式再改幾行；沒跑過那一支，這一支跑完也會把那一支的規則一起帶進來，結果一樣）。
--
-- Paul 2026-11-26（一個人的頁面：他剛把她加進 Summer Bootcamp 2025 當講者，標籤那一行還是寫
--   「2025 to 2025 · Old database: Speaker, Spring 2025 (event not recorded)」）：
--   「its weird now, Like i add a participation into this person as a speaker but the label doesn't show up」
--
-- 為什麼：2027-01-08 把舊名單的備註搬成標籤的時候，對不到哪一場的（「Speaker, Spring 2025 (event not recorded)」）留了一個 BT 給的標籤，
--   補充說明寫那一句、年份寫那一年、「到哪一年」也寫那一年。標籤的規則是「BT 寫了補充說明就用 BT 寫的」，
--   所以之後有人把真的那一場補進去，畫面上還是印舊的那一句與那個「到哪一年」，看起來像沒加進去。
--
-- ============================================================================
-- 這一支在做什麼（兩支函式各改幾行，其他一個字都沒動）
-- ============================================================================
--   同一種標籤，**從紀錄算得出來**（有出席、職位、配對、當講者的紀錄），而 BT 給的那一個的補充說明是「Old database:」開頭的：
--     補充說明  用紀錄的（哪幾場活動、哪幾個 team），不用舊的那一句。
--     哪一年起  用紀錄的。
--     到哪一年  不看（舊的那一句寫的「到哪一年」只是那一年他在，不是他真的到那一年為止）。
--     現在還是不是  照紀錄算。
--   舊的那一句**沒有刪**，還在 rc_labels 裡，一個人的頁面底下「加、改標籤」那一塊看得到、拿得掉。
--   只有 BT 給的、紀錄裡沒有的（還沒補進任何一場），照舊印舊的那一句：那是目前唯一知道的事。
--   BT 自己寫的補充說明（不是 Old database: 開頭的）照舊優先，沒有變。
--
-- 沒有動的：資料一列都沒改；沒有新的表、沒有動 RLS；兩支函式照舊不開給前端；2027-01-16 的兩條規則（幹部的三個來源、三個學年以前的學員）都還在。
--
-- ⚠ 之後如果重跑 2027-01-06、2027-01-12 或 2027-01-16 那三支裡的任何一支，要再跑一次這一支（那幾支會把函式換回舊的版本）。第 2 列會告訴你兩邊對不對得上。
-- ============================================================================

begin;

-- ---------- 1. 一個人的標籤（規則的正本）：照 2027-01-16 那一版，多「有紀錄就不看舊的那一句」 ----------
create or replace function public.rc_labels_of(p_person uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  with pe as (select p.id, p.kind, p.grad_year, pr.role as acct from public.people p left join public.profiles pr on pr.id = p.profile_id where p.id = p_person),
  cur as (select (select id from public.terms where status = 'current' limit 1) as id, extract(year from now())::int as y,
                 extract(year from (now() - interval '7 months'))::int as sy),
  part as (select x.role, e.id as event_id, e.starts_at, e.term_id, coalesce(nullif(e.title_zh, ''), e.title_en, '') as title,
                  -- 那一場是哪一天：沒有日期的舊活動用它那一屆的第一天。
                  coalesce(e.starts_at::date, (select t.starts_on from public.terms t where t.id = e.term_id)) as on_day
             from public.rc_participation x join public.events e on e.id = x.event_id where x.person_id = p_person),
  spk as (select e.id as event_id, e.starts_at, coalesce(nullif(e.title_zh, ''), e.title_en, '') as title
            from public.event_speakers s join public.events e on e.id = s.event_id where s.person_id = p_person
          union select event_id, starts_at, title from part where role = 'speaker'),
  prs as (select case when pr.mentor_id = p_person then 'mentor' else 'mentee' end as side, pr.matched_on, pr.ended_on, e.term_id, e.starts_at
            from public.rc_pairs pr left join public.events e on e.id = pr.event_id where pr.mentor_id = p_person or pr.mentee_id = p_person
          union all select role, null::date, null::date, term_id, starts_at from part where role in ('mentor', 'mentee')),
  pos as (select po.term_id, po.team, t.starts_on from public.positions po left join public.terms t on t.id = po.term_id where po.person_id = p_person),
  -- 一種身分最近三場活動的名字，用「, 」接起來。
  evs as (select role, string_agg(title, ', ' order by starts_at desc nulls last) as titles
            from (select role, title, starts_at, row_number() over (partition by role order by starts_at desc nulls last) as rn
                    from (select distinct role, event_id, title, starts_at from part where title <> ''
                          union select distinct 'speaker', event_id, title, starts_at from spk where title <> '') d) r
           where rn <= 3 group by role),
  e as (
    select 'member' as label, (select min(extract(year from starts_on))::int from pos) as since,
           (exists (select 1 from pos, cur where pos.term_id = cur.id) or (select acct = 'cadre' from pe)) as current,
           (select count(distinct term_id)::int from pos) as n,
           coalesce((select string_agg(distinct team, ', ') from pos where coalesce(team, '') <> ''), '') as detail
     where exists (select 1 from pos) or (select acct in ('cadre', 'alumni') from pe)
    union all
    select 'intern', null, true, 0, '' where (select acct = 'intern' from pe)
    union all
    select 'student', (select min(extract(year from starts_at))::int from part where role = 'student'),
           (select kind = 'student' and (grad_year is null or grad_year >= cur.y) from pe, cur),
           (select count(distinct event_id)::int from part where role = 'student'), coalesce((select titles from evs where role = 'student'), '')
     where exists (select 1 from part where role = 'student') or (select kind = 'student' from pe)
    union all
    select 'mentee', (select min(coalesce(extract(year from matched_on), extract(year from starts_at)))::int from prs where side = 'mentee'),
           exists (select 1 from prs, cur where side = 'mentee' and matched_on is not null and ended_on is null and prs.term_id = cur.id),
           (select count(*)::int from prs where side = 'mentee'), ''
     where exists (select 1 from prs where side = 'mentee')
    union all
    select 'mentor', (select min(coalesce(extract(year from matched_on), extract(year from starts_at)))::int from prs where side = 'mentor'),
           exists (select 1 from prs, cur where side = 'mentor' and matched_on is not null and ended_on is null and prs.term_id = cur.id),
           (select count(*)::int from prs where side = 'mentor'), ''
     where exists (select 1 from prs where side = 'mentor')
    union all
    select 'speaker', (select min(extract(year from starts_at))::int from spk),
           exists (select 1 from spk where starts_at >= now()), (select count(distinct event_id)::int from spk), coalesce((select titles from evs where role = 'speaker'), '')
     where exists (select 1 from spk)
    union all
    select 'volunteer', (select min(extract(year from starts_at))::int from part where role = 'volunteer'), false,
           (select count(distinct event_id)::int from part where role = 'volunteer'), coalesce((select titles from evs where role = 'volunteer'), '')
     where exists (select 1 from part where role = 'volunteer')
    union all
    select 'organizer', (select min(extract(year from starts_at))::int from part where role = 'organizer'), false,
           (select count(distinct event_id)::int from part where role = 'organizer'), coalesce((select titles from evs where role = 'organizer'), '')
     where exists (select 1 from part where role = 'organizer')
  ),
  g as (select label, detail, since_year::int as since, until_year::int as until from public.rc_labels where person_id = p_person),
  ords(label, ord) as (values ('member', 1), ('intern', 2), ('student', 3), ('mentee', 4), ('mentor', 5), ('speaker', 6), ('volunteer', 7), ('organizer', 8),
                              ('professor', 11), ('admission_officer', 12), ('connection', 13)),
  l as (
    select o.ord, o.label, (g.label is not null) as given, (e.label is not null) as earned,
           -- 2026-11-26：舊資料庫留下來的那一句（Old database: …）只是「有這件事、但沒有紀錄」的佔位。同一種標籤現在有真的紀錄了，就照紀錄：
           -- 年份、到哪一年、現在還是不是、補充說明都不再看那一句。那一句還在 rc_labels 裡，畫面底下拿得掉。
           case when (e.label is not null and coalesce(g.detail like 'Old database:%', false)) then e.since else coalesce(g.since, e.since) end as since,
           case when (e.label is not null and coalesce(g.detail like 'Old database:%', false)) then null else g.until end as until,
           case when o.label = 'student' then coalesce((select kind = 'student' and (grad_year is null or grad_year >= cur.y) from pe), false) and ((e.label is not null and coalesce(g.detail like 'Old database:%', false)) or g.until is null or g.until >= cur.y)
                     -- 2026-11-26：沒寫畢業年、而第一次以學員或 mentee 來是三個學年以前（那時候最小是高一，現在一定畢業了）：不算現在的學員。
                     and not coalesce((select (select grad_year is null from pe) and min(extract(year from (x.on_day - interval '7 months'))::int) + 3 <= cur.sy
                                         from part x where x.role in ('student', 'mentee')), false)
                -- 2026-11-26：只有 BT 給的「幹部」標籤（沒有職位、帳號也不是幹部）：除非寫了到哪一年而且還沒到，不然算以前的（校友）。
                when o.label = 'member' and e.label is null then coalesce(g.until >= cur.y, false)
                when g.until is not null and not (e.label is not null and coalesce(g.detail like 'Old database:%', false)) then g.until >= cur.y
                when e.label is not null then coalesce(e.current, false)
                else true end as current,
           coalesce(e.n, 0) as n,
           case when (e.label is not null and coalesce(g.detail like 'Old database:%', false)) then coalesce(e.detail, '') else coalesce(nullif(g.detail, ''), e.detail, '') end as detail
      from ords o left join e on e.label = o.label left join g on g.label = o.label cross join cur
     where e.label is not null or g.label is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'source', case when earned then 'earned' else 'given' end, 'given', given, 'earned', earned,
                                               'since', since, 'until', until, 'current', coalesce(current, false), 'n', n, 'detail', detail) order by ord), '[]'::jsonb) from l;
$$;
revoke all on function public.rc_labels_of(uuid) from public, anon, authenticated;

-- ---------- 2. 每一個人的標籤代號（名錄用）：同一條 ----------
create or replace function public.rc_label_codes_all()
returns table (person_id uuid, codes jsonb)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with cur as (select (select id from public.terms where status = 'current' limit 1) as id, extract(year from now())::int as y,
                 extract(year from (now() - interval '7 months'))::int as sy),
  pe as (select p.id, p.kind, p.grad_year, pr.role as acct
           from public.people p left join public.profiles pr on pr.id = p.profile_id where p.forgotten_at is null),
  part as (select x.person_id,
                  bool_or(x.role = 'student') as st, bool_or(x.role = 'mentee') as me, bool_or(x.role = 'mentor') as mo,
                  bool_or(x.role = 'speaker') as sp, bool_or(x.role = 'volunteer') as vo, bool_or(x.role = 'organizer') as org,
                  bool_or(x.role = 'speaker' and e.starts_at >= now()) as sp_cur,
                  min(extract(year from (coalesce(e.starts_at::date, t.starts_on) - interval '7 months'))::int) filter (where x.role in ('student', 'mentee')) as first_sy
             from public.rc_participation x join public.events e on e.id = x.event_id left join public.terms t on t.id = e.term_id group by x.person_id),
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
    select pe.id, pe.kind, pe.grad_year, part.first_sy, v.label, v.has, v.live
      from pe
      left join part on part.person_id = pe.id
      left join spk on spk.person_id = pe.id
      left join prs on prs.person_id = pe.id
      left join pos on pos.person_id = pe.id
      cross join lateral (values
        ('member',    pos.person_id is not null or coalesce(pe.acct in ('cadre', 'alumni'), false),
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
           case when e.label = 'student' then (e.kind = 'student' and (e.grad_year is null or e.grad_year >= cur.y)) and ((e.has and coalesce(g.detail like 'Old database:%', false)) or g.until_year is null or g.until_year >= cur.y)
                     and not coalesce(e.grad_year is null and e.first_sy + 3 <= cur.sy, false)
                when e.label = 'member' and not e.has then coalesce(g.until_year >= cur.y, false)
                when g.until_year is not null and not (e.has and coalesce(g.detail like 'Old database:%', false)) then g.until_year >= cur.y
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

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  -- 每一個人、每一個「Old database:」的標籤，連同 rc_labels_of 算出來的那一列
  ph as (
    select g.person_id, g.label, g.detail as old_detail, g.until_year, l.v
      from public.rc_labels g join public.people p on p.id = g.person_id and p.forgotten_at is null
      left join lateral (select x.v from jsonb_array_elements(public.rc_labels_of(g.person_id)) x(v) where x.v->>'label' = g.label) l on true
     where g.detail like 'Old database:%'
  ),
  t as (
    select
      (select count(*)::int from ph) as placeholders,
      (select count(*)::int from ph where (v->>'earned')::boolean) as covered,
      -- 有紀錄的：畫面上不能再印舊的那一句，也不能再有「到哪一年」
      (select count(*)::int from ph where (v->>'earned')::boolean and (v->>'detail' like 'Old database:%' or v->>'until' is not null)) as still_old,
      -- 沒有紀錄的：照舊印舊的那一句
      (select count(*)::int from ph where not (v->>'earned')::boolean and v->>'detail' is distinct from old_detail) as lost_note,
      (select count(*)::int from public.people p left join public.rc_label_codes_all() a on a.person_id = p.id
        where p.forgotten_at is null and coalesce(a.codes, '[]'::jsonb) is distinct from public.rc_label_codes(p.id)) as label_diff,
      (select position('then coalesce(e.detail, $q$$q$) else coalesce(nullif(g.detail, $q$$q$), e.detail, $q$$q$) end as detail' in replace(body, chr(39) || chr(39), '$q$$q$')) > 0
              and position('when g.until is not null and not (e.label is not null and coalesce(g.detail like' in body) > 0 from fn where proname = 'rc_labels_of') as of_new,
      (select position('when g.until_year is not null and not (e.has and coalesce(g.detail like' in body) > 0 from fn where proname = 'rc_label_codes_all') as all_new,
      -- 2027-01-16 的兩條規則還在
      (select position('kind = ' || chr(39) || 'member' || chr(39) in body) = 0 and position('and e.label is null then coalesce(g.until >= cur.y, false)' in body) > 0 and position('+ 3 <= cur.sy' in body) > 0 from fn where proname = 'rc_labels_of') as of_0116,
      (select position('kind = ' || chr(39) || 'member' || chr(39) in body) = 0 and position('and not e.has then coalesce(g.until_year >= cur.y, false)' in body) > 0 and position('e.first_sy + 3 <= cur.sy' in body) > 0 from fn where proname = 'rc_label_codes_all') as all_0116,
      (select coalesce(array_agg(proname::text order by proname), '{}') from fn
        where proname in ('rc_labels_of', 'rc_label_codes_all', 'rc_label_codes')
          and (has_function_privilege('anon', oid, 'execute') or has_function_privilege('authenticated', oid, 'execute'))) as open_fns
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when still_old = 0 and lost_note = 0 and label_diff = 0 and of_new and all_new and of_0116 and all_0116 and open_fns = '{}' then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '舊資料庫留下來的標籤有幾個；其中同一種現在有真的紀錄的有幾個', '', placeholders::text || '；' || covered::text, 'INFO' from t
  union all select 2, '★ 名錄算的標籤跟一個人那一頁算的一模一樣（對不上的人數）', '0', label_diff::text, case when label_diff = 0 then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 有真的紀錄的：畫面上不再印舊的那一句、也沒有「到哪一年」', '0', still_old::text, case when still_old = 0 then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 還沒有紀錄的：舊的那一句照舊印著', '0', lost_note::text, case when lost_note = 0 then 'PASS' else 'FAIL' end from t
  union all select 5, '兩支函式都有這一條', 'true', (coalesce(of_new, false) and coalesce(all_new, false))::text, case when of_new and all_new then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 2027-01-16 的兩條規則還在（幹部的三個來源、三個學年以前的學員）', 'true', (coalesce(of_0116, false) and coalesce(all_0116, false))::text, case when of_0116 and all_0116 then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 這三支算標籤的函式都不開給前端', '{}', open_fns::text, case when open_fns = '{}' then 'PASS' else 'FAIL' end from t
) x order by ord;
