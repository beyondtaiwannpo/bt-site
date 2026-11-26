-- 標籤兩件事：「幹部／校友」不再只因為名單上那一格寫 member 就有；很久以前來過的學員算「以前的學員」（2026-11-26）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 要先跑過 2027-01-06-labels-and-schools.sql 與 2027-01-12-fast-directory.sql（這一支重寫它們各一支函式）。
--
-- Paul 2026-11-26（看著名錄）：
--   「I don't think Edison… was never a member, so he shouldn't be labeled as alumni. Speaker doesn't count as alumni.
--     We're talking about like people who used to work in one of the team.」
--   「can you turn all students with an outcome into former student like I saw a lot of student they attended event before
--     and now they are definitely in the age of university」
--
-- 查到的（正式站，2026-11-26）：
--   幹部／校友：有這個標籤的 150 個人裡，143 個是 BT 給的標籤，來源是舊資料庫備註裡的「Board」（2027-01-08 那一支搬的，91 個沒寫哪一期）。
--     標籤不是從「當過講者」來的。Paul 同一天決定：那 91 個人先不動，改成「在一個人的頁面上拿得掉」。
--     拿不掉的原因：people.kind 對這些人是 member（表的預設值，配對匯入的 mentor 也被寫成 member），規則裡「kind 是 member」本身就算幹部，
--     所以把 BT 給的標籤拿掉之後，標籤還是從 kind 算出來，而畫面上沒有任何地方改得了 kind。
--   學員：畫面上是「學員」（現在還在念高中）的有 766 個人，其中 728 個沒寫畢業年，584 個第一次來是 2023-24 學年或更早。
--     有去向的只有 3 個（去向那條路 2027-01-06 已經處理過），所以照「有去向」改幾乎不會動到人；Paul 要的是後面那一句：很久以前來過的，現在一定不是高中生了。
--
-- ============================================================================
-- 這一支在做什麼（兩支函式各改幾行，其他一個字都沒動）
-- ============================================================================
--   A. 「幹部」標籤只有三個來源，跟 Paul 的定義一樣（在某一個 team 做過事的人）：
--        1. 有職位（positions：哪一屆、哪一個 team）。 2. 帳號是幹部或校友。 3. BT 給的標籤（在一個人的頁面上加、改、拿掉）。
--      people.kind 是 member 不再算。
--      現在還是不是：這一屆有職位、或帳號是幹部，才是「幹部」；其他的畫面上叫「校友（前幹部）」。
--      只有 BT 給的標籤的人算校友（除非那個標籤寫了「到哪一年」而且還沒到）。以前這種人會被當成現任，這一支一起改掉，
--      不然舊資料庫那一百多個人會從「校友」變成「幹部」。
--   B. 「學員」現在還是不是，多一個條件：沒寫畢業年、而他第一次以學員或 mentee 的身分來是三個學年以前，就算「以前的學員」。
--      算法：學年從八月起算；那一場的日期（沒有日期的舊活動用它那一屆的第一天）是哪一個學年，加三還不超過現在這個學年，就是畢業了。
--      例：2023-24 學年來過的人，當時最小是高一，2026 年 6 月畢業，所以 2026-27 學年起不算；2024-25 來過的還可能是高三，照舊算學員。
--      有寫畢業年的人照畢業年，不看這一條。
--   兩支函式：rc_labels_of(person) 是一個人的那一頁用的（規則的正本），rc_label_codes_all() 是名錄用的（一次算全部）。
--
-- ⚠ B 只改畫面上那個標籤，**沒有改「現在還在念高中」那一格（people.kind）**。
--   那一格是兩道門在看的（還在念高中的學員開不了個人連結、去向不連名字公開）。把五百多個人的那一格一次取消，等於一次打開那兩道門，
--   而這一條是用「第一次來的時間」推的，不是他本人講的，所以這一支不碰。要一起取消是另一個決定，要 Paul 說。
--
-- 沒有動的：
--   - 資料一列都沒改：people、rc_labels、positions、rc_participation 都沒有碰。只換了兩支函式的算法。
--   - 誰讀得到、誰改得動：沒有新的表、沒有動 RLS。這兩支函式照舊不開給前端。標籤只是描述，不給任何權限。
--   - 其他九種標籤的算法。
--
-- ⚠ 之後如果重跑 2027-01-06-labels-and-schools.sql 或 2027-01-12-fast-directory.sql，要再跑一次這一支，
--   不然那一支函式會被換回舊的規則。只換回一邊的話，名錄與一個人那一頁的標籤會對不上，這一支的第 3 列會變紅。
-- ============================================================================

begin;

-- ---------- 1. 一個人的標籤（規則的正本）：照 2027-01-06 那一版，改 member 的來源、只有 BT 給的 member 算以前的、學員多一個條件 ----------
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
           coalesce(g.since, e.since) as since, g.until as until,
           case when o.label = 'student' then coalesce((select kind = 'student' and (grad_year is null or grad_year >= cur.y) from pe), false) and (g.until is null or g.until >= cur.y)
                     -- 2026-11-26：沒寫畢業年、而第一次以學員或 mentee 來是三個學年以前（那時候最小是高一，現在一定畢業了）：不算現在的學員。
                     and not coalesce((select (select grad_year is null from pe) and min(extract(year from (x.on_day - interval '7 months'))::int) + 3 <= cur.sy
                                         from part x where x.role in ('student', 'mentee')), false)
                -- 2026-11-26：只有 BT 給的「幹部」標籤（沒有職位、帳號也不是幹部）：除非寫了到哪一年而且還沒到，不然算以前的（校友）。
                when o.label = 'member' and e.label is null then coalesce(g.until >= cur.y, false)
                when g.until is not null then g.until >= cur.y
                when e.label is not null then coalesce(e.current, false)
                else true end as current,
           coalesce(e.n, 0) as n, coalesce(nullif(g.detail, ''), e.detail, '') as detail
      from ords o left join e on e.label = o.label left join g on g.label = o.label cross join cur
     where e.label is not null or g.label is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'source', case when earned then 'earned' else 'given' end, 'given', given, 'earned', earned,
                                               'since', since, 'until', until, 'current', coalesce(current, false), 'n', n, 'detail', detail) order by ord), '[]'::jsonb) from l;
$$;
revoke all on function public.rc_labels_of(uuid) from public, anon, authenticated;

-- ---------- 2. 每一個人的標籤代號（名錄用）：照 2027-01-12 那一版，同樣那三處 ----------
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
           case when e.label = 'student' then (e.kind = 'student' and (e.grad_year is null or e.grad_year >= cur.y)) and (g.until_year is null or g.until_year >= cur.y)
                     and not coalesce(e.grad_year is null and e.first_sy + 3 <= cur.sy, false)
                when e.label = 'member' and not e.has then coalesce(g.until_year >= cur.y, false)
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

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select
      -- kind 是 member，但沒有職位、帳號不是幹部或校友、BT 也沒給標籤：這些人從這一支開始沒有幹部標籤。
      (select count(*)::int from public.people p left join public.profiles pr on pr.id = p.profile_id
        where p.forgotten_at is null and p.kind = 'member'
          and not exists (select 1 from public.positions po where po.person_id = p.id)
          and coalesce(pr.role in ('cadre', 'alumni'), false) = false
          and not exists (select 1 from public.rc_labels g where g.person_id = p.id and g.label = 'member')) as kind_only,
      (select count(*)::int from public.people p left join public.profiles pr on pr.id = p.profile_id
        where p.forgotten_at is null and p.kind = 'member'
          and not exists (select 1 from public.positions po where po.person_id = p.id)
          and coalesce(pr.role in ('cadre', 'alumni'), false) = false
          and not exists (select 1 from public.rc_labels g where g.person_id = p.id and g.label = 'member')
          and public.rc_label_codes(p.id)::text ~ '"member') as kind_only_still,
      -- 有職位、帳號是幹部或校友、或 BT 給了標籤的人，一個都不能少。
      (select count(*)::int from public.people p left join public.profiles pr on pr.id = p.profile_id
        where p.forgotten_at is null
          and (exists (select 1 from public.positions po where po.person_id = p.id) or coalesce(pr.role in ('cadre', 'alumni'), false)
               or exists (select 1 from public.rc_labels g where g.person_id = p.id and g.label = 'member'))
          and public.rc_label_codes(p.id)::text !~ '"member') as lost,
      (select count(*)::int from public.people p left join public.rc_label_codes_all() a on a.person_id = p.id
        where p.forgotten_at is null and coalesce(a.codes, '[]'::jsonb) is distinct from public.rc_label_codes(p.id)) as label_diff,
      (select body like '%where exists (select 1 from pos) or (select acct in (''cadre'', ''alumni'') from pe)%' and body not like '%kind = ''member''%' from fn where proname = 'rc_labels_of') as of_ok,
      (select body like '%(''member'',    pos.person_id is not null or coalesce(pe.acct in (''cadre'', ''alumni''), false),%' and body not like '%kind = ''member''%' from fn where proname = 'rc_label_codes_all') as all_ok,
      (select body like '%''given'', given, ''earned'', earned%' and body like '%when o.label = ''student'' then%' and body like '%(''connection'', 13)%' from fn where proname = 'rc_labels_of') as of_rest,
      (select coalesce(array_agg(proname::text order by proname), '{}') from fn
        where proname in ('rc_labels_of', 'rc_label_codes_all', 'rc_label_codes')
          and (has_function_privilege('anon', oid, 'execute') or has_function_privilege('authenticated', oid, 'execute'))) as open_fns,
      (select count(*)::int from public.rc_labels where label = 'member') as given_n,
      -- 只有 BT 給的標籤（沒有職位、帳號不是幹部或校友）、沒寫到哪一年的人：一定要是「校友」，不能是現任。
      (select count(*)::int from public.rc_labels g join public.people p on p.id = g.person_id left join public.profiles pr on pr.id = p.profile_id
        where g.label = 'member' and g.until_year is null and p.forgotten_at is null
          and not exists (select 1 from public.positions po where po.person_id = p.id) and coalesce(pr.role in ('cadre', 'alumni'), false) = false
          and public.rc_label_codes(p.id) ? 'member') as given_as_current,
      -- 因為「三個學年以前來過」而變成以前的學員的人數，與裡面有寫畢業年的（應該是 0：有寫畢業年的不看這一條）。
      (select count(*)::int from public.people p where p.forgotten_at is null and p.kind = 'student' and p.grad_year is null and public.rc_label_codes(p.id) ? 'student:past') as aged_out,
      (select count(*)::int from public.people p where p.forgotten_at is null and p.kind = 'student' and p.grad_year >= extract(year from now())::int
          and not exists (select 1 from public.rc_labels g where g.person_id = p.id and g.label = 'student' and g.until_year < extract(year from now())::int)
          and public.rc_label_codes(p.id) ? 'student:past') as grad_year_ignored,
      (select body like '%min(extract(year from (x.on_day - interval ''7 months''))::int) + 3 <= cur.sy%' and body like '%when o.label = ''member'' and e.label is null then coalesce(g.until >= cur.y, false)%' from fn where proname = 'rc_labels_of') as of_new,
      (select body like '%e.grad_year is null and e.first_sy + 3 <= cur.sy%' and body like '%when e.label = ''member'' and not e.has then coalesce(g.until_year >= cur.y, false)%' from fn where proname = 'rc_label_codes_all') as all_new
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when kind_only_still = 0 and lost = 0 and label_diff = 0 and of_ok and all_ok and of_rest and open_fns = '{}' and given_as_current = 0 and grad_year_ignored = 0 and of_new and all_new
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '只因為名單上寫 member 才有標籤的人，從現在起沒有這個標籤（只是告訴你有幾個）', '', kind_only::text, 'INFO' from t
  union all select 2, '★ 這些人裡還有幹部或校友標籤的', '0', kind_only_still::text, case when kind_only_still = 0 then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 名錄算的標籤跟一個人那一頁算的一模一樣（對不上的人數）', '0', label_diff::text, case when label_diff = 0 then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 有職位、帳號是幹部或校友、或 BT 給了標籤的人，標籤一個都沒少', '0', lost::text, case when lost = 0 then 'PASS' else 'FAIL' end from t
  union all select 5, '一個人那一頁的規則：member 只看職位與帳號（BT 給的在後面合進來）', 'true', coalesce(of_ok, false)::text, case when of_ok then 'PASS' else 'FAIL' end from t
  union all select 6, '名錄那一份的規則同一條', 'true', coalesce(all_ok, false)::text, case when all_ok then 'PASS' else 'FAIL' end from t
  union all select 7, '其他標籤的規則沒被動到（學員、BT 給的、十一種的順序）', 'true', coalesce(of_rest, false)::text, case when of_rest then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 這三支算標籤的函式都不開給前端', '{}', open_fns::text, case when open_fns = '{}' then 'PASS' else 'FAIL' end from t
  union all select 9, 'BT 給的幹部標籤有幾個（這一支沒有碰，只是告訴你數字）', '', given_n::text, 'INFO' from t
  union all select 10, '★ 只有 BT 給的幹部標籤的人是「校友」，沒有人被當成現任', '0', given_as_current::text, case when given_as_current = 0 then 'PASS' else 'FAIL' end from t
  union all select 11, '沒寫畢業年、現在算「以前的學員」的人有幾個（只是告訴你數字）', '', aged_out::text, 'INFO' from t
  union all select 12, '★ 有寫畢業年而且還沒畢業的人，沒有人被這一條改成以前的學員', '0', grad_year_ignored::text, case when grad_year_ignored = 0 then 'PASS' else 'FAIL' end from t
  union all select 13, '兩支函式都有新的那兩條（三個學年、只有 BT 給的幹部）', 'true', (coalesce(of_new, false) and coalesce(all_new, false))::text, case when of_new and all_new then 'PASS' else 'FAIL' end from t
) x order by ord;
