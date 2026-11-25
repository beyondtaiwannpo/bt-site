-- 標籤每一種都可以自己加；念大學或工作了就不算「現在還在念高中」（2026-11-25）。
--
-- Paul 的原話（看著紀錄裡一個人的那一頁）：
--   「why is it not editable from people?… Each people should be able to be given label, and then label can be added and… there's got to be detail…
--     if he was the speaker of our overseas unpack, that label should say it. And we should be able to edit that if we click into individual people.」
--   「she used to be a student, but now she is in University of Washington… AIA… is her current school, which is not right… always put university or job
--     in a chronologically order. And put the latest as their current status. And obviously, if they're a university student, untick the currently a
--     high school student thing.」
--
-- 這一支做什麼：
--   1. rc_labels（BT 給的標籤）原本只收三種（教授、招生官、聯絡人），改成十一種都收：
--      幹部、實習生、學員、Mentee、Mentor、講者、志工、主辦、教授、招生官、聯絡人。一個人一種標籤還是只有一列（補充說明、哪一年起、到哪一年）。
--   2. rc_label_set() 重寫一次：只多認得那八種，其他一個字都沒改。門還是管得了紀錄的人（rc_can_manage）。
--   3. rc_labels_of() 重寫一次：同一種標籤「從紀錄算出來的」與「BT 給的」合成一列。
--      補充說明：BT 寫了就用 BT 寫的；沒寫的話，講者、學員、志工、主辦會列出是哪幾場活動（最近三場）。
--      哪一年起：BT 寫了就用 BT 寫的。到哪一年：只有 BT 寫的才有。
--      現在還是不是：BT 寫了「到哪一年」就照那一年；沒寫就照紀錄；只有 BT 給的、沒寫到哪一年的當成現在還是。
--      「學員」例外：現在還是學員一定要「現在還在念高中」那一格是勾著的，光給標籤不算。
--      每一列多兩個鍵 given、earned（true／false），畫面用來分「可以拿掉」與「從紀錄來的」。
--   4. 一個 trigger（rc_outcomes_left_school）：去向多了一筆「就讀、轉學、畢業、工作」（年份是空的或不晚於今年），
--      而那個人「現在還在念高中」是勾著的、也沒有自己的帳號，就把那一格取消（kind 從 student 變 guest，跟在畫面上取消那一格一模一樣），
--      同時留一個 BT 給的「學員」標籤（到去向那一年），所以他還是看得出「以前的學員」。寫一筆變動紀錄（left_high_school）。
--      「申請、錄取」不算：高三錄取了還在念高中。有自己帳號的學員不動：那一格本來就鎖著，跟著他的帳號走。
--   5. 把現有的資料照第 4 條補一次（讓每一筆符合的去向再過一次那個 trigger）。
--
-- 沒有動的：
--   - 誰讀得到、誰改得動：沒有新的表、沒有動 RLS，rc_can_view／rc_can_manage 沒有改。沒登入的人照舊什麼都叫不到。
--   - 標籤只是描述一個人，不給任何權限。資料庫裡沒有任何一道門看 rc_labels。
--   - 「還在念高中的學員不開個人連結、去向不連名字公開」那兩道門一行沒改（看的還是 kind 與畢業年）。
--     ⚠ 第 4、5 條會讓「已經念大學或工作的人」不再被那兩道門擋：那是 Paul 要的（他們不是高中生了）。
--   - people.school（名單上那一格學校）沒有動。那一頁「現在在哪」是畫面照去向與學校的年份排出來的。
--
-- 可以重跑。跑完看最後那張表，每一列都要是 PASS。第 9 列會寫這一次取消了幾個人的「現在還在念高中」。
-- ⚠ 之後如果重跑 2027-01-03-people-network.sql，要再跑一次這一支，不然 rc_label_set 與 rc_labels_of 會被換回只認三種的版本。

begin;

-- ---------- 1. rc_labels 收十一種 ----------
alter table public.rc_labels drop constraint if exists rc_labels_label_check;
alter table public.rc_labels add constraint rc_labels_label_check
  check (label in ('member', 'intern', 'student', 'mentee', 'mentor', 'speaker', 'volunteer', 'organizer', 'professor', 'admission_officer', 'connection'));
comment on table public.rc_labels is 'BT 給的標籤，十一種都可以（2027-01-06 起；原本只有教授、招生官、聯絡人）。從紀錄算出來的不存在這裡，rc_labels_of() 把兩邊合起來。標籤只是描述，不給任何權限。';

-- ---------- 2. 管紀錄的人加、改、拿掉標籤 ----------
-- 跟 2027-01-03-people-network.sql 那一版只差一行：認得的標籤從三種變十一種。
create or replace function public.rc_label_set(p_person uuid, p_label text, p_on boolean, p_detail text, p_since int, p_until int)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if p_label not in ('member', 'intern', 'student', 'mentee', 'mentor', 'speaker', 'volunteer', 'organizer', 'professor', 'admission_officer', 'connection') then raise exception 'bad_label' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.people where id = p_person and forgotten_at is null) then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  if not coalesce(p_on, false) then
    delete from public.rc_labels where person_id = p_person and label = p_label;
    perform public.rc_log_it('label_remove', p_person, jsonb_build_object('label', p_label), null);
    return false;
  end if;
  if p_since is not null and p_until is not null and p_until < p_since then raise exception 'bad_years' using errcode = 'P0001'; end if;
  insert into public.rc_labels (person_id, label, detail, since_year, until_year, set_by)
  values (p_person, p_label, left(btrim(coalesce(p_detail, '')), 160), p_since, p_until, auth.uid())
  on conflict (person_id, label) do update set detail = excluded.detail, since_year = excluded.since_year, until_year = excluded.until_year, set_by = excluded.set_by, set_at = now();
  perform public.rc_log_it('label_set', p_person, null, jsonb_build_object('label', p_label, 'detail', left(btrim(coalesce(p_detail, '')), 160)));
  return true;
end $$;
revoke all on function public.rc_label_set(uuid, text, boolean, text, int, int) from public, anon;
grant execute on function public.rc_label_set(uuid, text, boolean, text, int, int) to authenticated;

-- ---------- 3. 標籤：從紀錄算的與 BT 給的合成一列 ----------
-- 回 [{ label, source: earned|given, given, earned, since, until, current, n, detail }]。
-- 「從紀錄算」那八種的算法跟 2027-01-03 那一版一樣，只多了補充說明（哪幾場活動）。
-- 不看權限，不開給前端：rc_person、rc_directory 自己守門之後才叫它。
create or replace function public.rc_labels_of(p_person uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  with pe as (select p.id, p.kind, p.grad_year, pr.role as acct from public.people p left join public.profiles pr on pr.id = p.profile_id where p.id = p_person),
  cur as (select (select id from public.terms where status = 'current' limit 1) as id, extract(year from now())::int as y),
  part as (select x.role, e.id as event_id, e.starts_at, e.term_id, coalesce(nullif(e.title_zh, ''), e.title_en, '') as title
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
     where exists (select 1 from pos) or (select kind = 'member' or acct in ('cadre', 'alumni') from pe)
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

-- ---------- 4. 念大學或工作了，就不算「現在還在念高中」 ----------
create or replace function public.rc_left_school_trg()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare pe record;
begin
  if new.kind not in ('enrolled', 'transferred', 'graduated', 'working') then return new; end if;
  if new.year is not null and new.year > extract(year from now())::int then return new; end if;
  select id, kind, profile_id into pe from public.people where id = new.person_id and forgotten_at is null;
  if pe.id is null or pe.kind <> 'student' or pe.profile_id is not null then return new; end if;
  update public.people set kind = 'guest' where id = pe.id;
  insert into public.rc_labels (person_id, label, detail, since_year, until_year, set_by)
  values (pe.id, 'student', '', null, new.year::smallint, null) on conflict (person_id, label) do nothing;
  perform public.rc_log_it('left_high_school', pe.id, jsonb_build_object('kind', 'student'), jsonb_build_object('kind', 'guest', 'because', new.kind, 'year', new.year));
  return new;
end $$;
revoke all on function public.rc_left_school_trg() from public, anon, authenticated;

drop trigger if exists rc_outcomes_left_school on public.rc_outcomes;
create trigger rc_outcomes_left_school after insert or update of kind, year on public.rc_outcomes
  for each row execute function public.rc_left_school_trg();

-- ---------- 5. 現有的資料補一次 ----------
-- 這一次會取消幾個人，先記下來給驗收表印（暫存表，這個連線結束就不見）。
create temporary table if not exists _left_school_run (n int) on commit preserve rows;
delete from _left_school_run;
insert into _left_school_run
select count(distinct pe.id)::int from public.people pe join public.rc_outcomes o on o.person_id = pe.id
 where pe.kind = 'student' and pe.profile_id is null and pe.forgotten_at is null
   and o.kind in ('enrolled', 'transferred', 'graduated', 'working') and (o.year is null or o.year <= extract(year from now())::int);

update public.rc_outcomes set kind = kind
 where kind in ('enrolled', 'transferred', 'graduated', 'working') and (year is null or year <= extract(year from now())::int);

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select
      (select pg_get_constraintdef(oid) like '%mentor%' and pg_get_constraintdef(oid) like '%speaker%' and pg_get_constraintdef(oid) like '%connection%'
         from pg_constraint where conname = 'rc_labels_label_check') as check_ok,
      (select body like '%rc_can_manage()%' and body like '%not_records_manager%' and body like '%''organizer''%' and body like '%bad_label%' and body like '%bad_years%' and body like '%no_such_person%'
         from fn where proname = 'rc_label_set') as set_gate,
      (select body like '%''given'', given%' and body like '%''earned'', earned%' and body like '%ords o left join e%' from fn where proname = 'rc_labels_of') as merged,
      (select body like '%o.label = ''student''%' and body like '%kind = ''student''%' from fn where proname = 'rc_labels_of') as student_rule,
      (select count(*) = 1 from pg_trigger where tgname = 'rc_outcomes_left_school' and not tgisinternal) as trg_ok,
      (select body like '%pe.profile_id is not null%' and body like '%''enrolled'', ''transferred'', ''graduated'', ''working''%' and body not like '%''admitted''%' and body like '%left_high_school%'
         from fn where proname = 'rc_left_school_trg') as trg_rule,
      (select coalesce(array_agg(proname::text order by proname), '{}') from fn
        where proname in ('rc_label_set', 'rc_labels_of', 'rc_left_school_trg') and has_function_privilege('anon', oid, 'execute')) as anon_fns,
      (select coalesce(array_agg(proname::text order by proname), '{}') from fn
        where proname in ('rc_labels_of', 'rc_left_school_trg') and has_function_privilege('authenticated', oid, 'execute')) as auth_fns,
      (select count(*)::int from public.people pe where pe.kind = 'student' and pe.profile_id is null and pe.forgotten_at is null
         and exists (select 1 from public.rc_outcomes o where o.person_id = pe.id and o.kind in ('enrolled', 'transferred', 'graduated', 'working')
                       and (o.year is null or o.year <= extract(year from now())::int))) as left_over,
      (select has_table_privilege('anon', 'public.rc_labels', 'select') or has_table_privilege('authenticated', 'public.rc_labels', 'select')) as table_open,
      coalesce((select n from _left_school_run limit 1), 0) as flipped
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when check_ok and set_gate and merged and student_rule and trg_ok and trg_rule and anon_fns = '{}' and auth_fns = '{}' and left_over = 0 and not table_open
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, 'rc_labels 收十一種標籤', 'true', coalesce(check_ok, false)::text, case when check_ok then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 加、改、拿掉標籤：門還是管得了紀錄的人，原本的檢查都還在', 'true', coalesce(set_gate, false)::text, case when set_gate then 'PASS' else 'FAIL' end from t
  union all select 3, '從紀錄算的與 BT 給的合成一列', 'true', coalesce(merged, false)::text, case when merged then 'PASS' else 'FAIL' end from t
  union all select 4, '★「現在還是學員」一定要「現在還在念高中」是勾著的，光給標籤不算', 'true', coalesce(student_rule, false)::text, case when student_rule then 'PASS' else 'FAIL' end from t
  union all select 5, '去向那張表有 rc_outcomes_left_school 這個 trigger', 'true', trg_ok::text, case when trg_ok then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 只認就讀、轉學、畢業、工作（錄取不算），有帳號的學員不動，會留變動紀錄', 'true', coalesce(trg_rule, false)::text, case when trg_rule then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 沒登入的人這三支一支都叫不到', '{}', anon_fns::text, case when anon_fns = '{}' then 'PASS' else 'FAIL' end from t
  union all select 8, '★ rc_labels_of 與 trigger 的函式不開給前端；rc_labels 那張表前端讀不到', '{} / false', auth_fns::text || ' / ' || table_open::text, case when auth_fns = '{}' and not table_open then 'PASS' else 'FAIL' end from t
  union all select 9, '這一次取消了幾個人的「現在還在念高中」（念大學或工作了；重跑會是 0）', '（看數字）', flipped::text, 'PASS' from t
  union all select 10, '跑完之後，已經念大學或工作、卻還勾著「現在還在念高中」的人', '0', left_over::text, case when left_over = 0 then 'PASS' else 'FAIL' end from t
) x order by ord;
