-- 校友的故事多一格「在 BT 做過什麼」（Paul 2026-11-16，BT 島）。
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。可以重跑。
-- 要先跑過 2026-10-27-public-names-english.sql（這一支改寫的是它建的 public_alumni()）
-- 與 2026-12-25-access-model.sql（這一支改寫的是它建的 stories_for_review()，門是 is_senior()）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- Paul 的原話：「when people sign up back and they agree to be put on it, they have an actual story
-- and they are connected to whatever thing they used to be on. If they were speaker, they are connected
-- to the curriculum team.」
--
-- /island/ 上的校友站在機場、走去他以前的那座島。之前只能拿最後一屆的職位字樣（title）猜，
-- 而講者、mentor、實習生、學員這些人在 positions 裡根本沒有職位，猜不出來。
-- 所以 alumni_stories 加兩欄，由本人自己填：
--   bt_role  他在 BT 做過什麼：cadre（幹部）、speaker（講者）、mentor、intern（實習生）、
--            ambassador（校園大使）、student（學員）。六選一。
--   bt_team  跟哪一個 team 最有關，六個 team 之一，可以不填（不填的話前端照 bt_role 給一個預設：
--            講者去 Curriculum、mentor 去 Mentorship、實習生去 Internship、大使去 Community Relations）。
--
-- 這兩欄跟那一句話一樣是「用 BT 的名義公開的事」（「我以前是 BT 的講者」是一句對外的宣稱），
-- 所以改了就跟改那一句話一樣自動下架、重新回到核可清單上。改城市不下架那條照舊。
--
-- 動到的東西：
--   1. alumni_stories 加 bt_role、bt_team 兩欄，各一條 check。
--   2. 本人 insert / update 這兩欄的欄位權限（跟 2026-09-18 那份清單同一個做法，story_approved 照舊不在裡面）。
--   3. recheck_alumni_story() 多看這兩欄。
--   4. public_alumni() 多回這兩欄（回傳欄位變了，所以要先 drop 再 create；/alumni/ 與 /island/ 都是照欄位名讀，多兩欄不會壞）。
--   5. stories_for_review() 多回這兩欄（後台核可那頁看得到他說自己做過什麼）。

begin;

-- ---------- 1. 兩欄 ----------
alter table public.alumni_stories add column if not exists bt_role text;
alter table public.alumni_stories add column if not exists bt_team text;

alter table public.alumni_stories drop constraint if exists alumni_stories_bt_role_check;
alter table public.alumni_stories add constraint alumni_stories_bt_role_check
  check (bt_role is null or bt_role in ('cadre', 'speaker', 'mentor', 'intern', 'ambassador', 'student'));

-- team 的字樣跟 workspaces.team / positions.team 同一組（settings/src/ui.js 的 TEAMS）。
alter table public.alumni_stories drop constraint if exists alumni_stories_bt_team_check;
alter table public.alumni_stories add constraint alumni_stories_bt_team_check
  check (bt_team is null or bt_team in ('Curriculum Team', 'Mentorship Team', 'Marketing Team',
                                        'Sponsorship Team', 'Internship Team', 'Community Relations Team'));

comment on column public.alumni_stories.bt_role is '他在 BT 做過什麼（cadre / speaker / mentor / intern / ambassador / student）。本人填。/island/ 用它決定他走去哪座島。';
comment on column public.alumni_stories.bt_team is '跟哪一個 team 最有關，六個 team 之一，可以空。本人填。';

-- ---------- 2. 本人寫得到這兩欄 ----------
-- 欄位層級的 grant 是累加的：這兩句只加這兩欄，2026-09-18 發的那些照舊，story_approved 照舊不在裡面。
grant insert (bt_role, bt_team) on public.alumni_stories to authenticated;
grant update (bt_role, bt_team) on public.alumni_stories to authenticated;

-- ---------- 3. 改了就下架 ----------
create or replace function public.recheck_alumni_story()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.quote    is distinct from old.quote
  or new.note     is distinct from old.note
  or new.quote_en is distinct from old.quote_en
  or new.note_en  is distinct from old.note_en
  or new.bt_role  is distinct from old.bt_role
  or new.bt_team  is distinct from old.bt_team then
    new.story_approved := false;
    new.approved_at := null;
  end if;
  return new;
end $$;

-- ---------- 4. 對外那支多回兩欄 ----------
-- 本文跟 2026-10-27 一模一樣，只在 returns 與 select 的最後多了 bt_role、bt_team。
drop function if exists public.public_alumni();
create function public.public_alumni()
returns table (
  id text, name text, school text, county text, city text, country text, place text,
  quote text, note text, school_en text, country_en text, quote_en text, note_en text, title text,
  bt_role text, bt_team text
) language sql security definer stable
set search_path = public, pg_temp
as $$
  select md5(s.id::text),
         coalesce(nullif(btrim(s.display_name), ''), nullif(btrim(p.name_en), ''), p.name_zh),
         s.school, s.county, s.city, s.country, s.place,
         s.quote, s.note, s.school_en, s.country_en, s.quote_en, s.note_en,
         (select string_agg(coalesce(po.title_en, po.title_zh), ' · ' order by po.team nulls first) || ' · ' || po.term_id
            from people pe join positions po on po.person_id = pe.id join terms t on t.id = po.term_id
           where pe.profile_id = p.id
             and t.id = (select t2.id from people pe2 join positions po2 on po2.person_id = pe2.id join terms t2 on t2.id = po2.term_id
                          where pe2.profile_id = p.id order by t2.starts_on desc limit 1)
           group by po.term_id),
         s.bt_role, s.bt_team
    from public.alumni_stories s
    join public.profiles p on p.id = s.id
   where s.public_story and s.story_approved
     and p.role in ('cadre', 'alumni')
     and s.county is not null
   order by s.approved_at nulls last, s.updated_at;
$$;
revoke all on function public.public_alumni() from public;
grant execute on function public.public_alumni() to anon, authenticated;

-- ---------- 5. 後台核可那份清單多回兩欄 ----------
-- 本文跟 2026-12-25 一模一樣（門是 is_senior()），只多了 bt_role、bt_team。
drop function if exists public.stories_for_review();
create function public.stories_for_review()
returns table(id uuid, name text, school text, county text, city text, country text, place text, quote text, note text,
              public_story boolean, story_approved boolean, updated_at timestamptz, approved_at timestamptz,
              bt_role text, bt_team text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select s.id,
         coalesce(nullif(btrim(s.display_name), ''), p.name_zh, p.name_en, '（沒有名字）'),
         s.school, s.county, s.city, s.country, s.place,
         s.quote, s.note, s.public_story, s.story_approved, s.updated_at, s.approved_at,
         s.bt_role, s.bt_team
    from public.alumni_stories s
    join public.profiles p on p.id = s.id
   where s.public_story
     and p.role in ('cadre', 'alumni')
     and public.is_senior()
   order by s.story_approved, s.updated_at desc;
$$;
revoke all on function public.stories_for_review() from public, anon;
grant execute on function public.stories_for_review() to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with f as (
    select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef
      from pg_proc where pronamespace = 'public'::regnamespace
  ),
  cols as (
    select string_agg(column_name, ',' order by column_name) as c
      from information_schema.columns
     where table_schema = 'public' and table_name = 'alumni_stories' and column_name in ('bt_role', 'bt_team')
  ),
  w as (
    select privilege_type, string_agg(column_name, ',' order by column_name) as c
      from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'alumni_stories' and grantee = 'authenticated'
       and column_name in ('bt_role', 'bt_team', 'story_approved', 'approved_at')
     group by privilege_type
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select c from cols) = 'bt_role,bt_team'
          and (select c from w where privilege_type = 'INSERT') = 'bt_role,bt_team'
          and (select c from w where privilege_type = 'UPDATE') = 'bt_role,bt_team'
          and (select body from f where proname = 'recheck_alumni_story') like '%new.bt_role  is distinct from old.bt_role%'
          and (select body from f where proname = 'public_alumni') like '%s.bt_role, s.bt_team%'
          and (select body from f where proname = 'public_alumni') like '%nullif(btrim(p.name_en), ''''), p.name_zh)%'
          and (select body from f where proname = 'public_alumni') like '%s.public_story and s.story_approved%'
          and (select body from f where proname = 'stories_for_review') like '%s.bt_role, s.bt_team%'
          and (select body from f where proname = 'stories_for_review') like '%is_senior()%'
          and (select count(*) from pg_proc p, aclexplode(p.proacl) x
                where p.proname = 'public_alumni' and x.grantee = 'anon'::regrole and x.privilege_type = 'EXECUTE') = 1
          and (select count(*) from pg_proc p, aclexplode(p.proacl) x
                where p.proname = 'stories_for_review' and x.grantee = 'anon'::regrole) = 0
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '兩欄都在', 'bt_role,bt_team', coalesce((select c from cols), '（沒有）'),
    case when (select c from cols) = 'bt_role,bt_team' then 'PASS' else 'FAIL' end
  union all select 2, '★ 本人 insert 得了這兩欄（story_approved 仍然不行）', 'bt_role,bt_team',
    coalesce((select c from w where privilege_type = 'INSERT'), '（沒有）'),
    case when (select c from w where privilege_type = 'INSERT') = 'bt_role,bt_team' then 'PASS' else 'FAIL' end
  union all select 3, '★ 本人 update 得了這兩欄（story_approved 仍然不行）', 'bt_role,bt_team',
    coalesce((select c from w where privilege_type = 'UPDATE'), '（沒有）'),
    case when (select c from w where privilege_type = 'UPDATE') = 'bt_role,bt_team' then 'PASS' else 'FAIL' end
  union all select 4, '★ 改了做過什麼就下架', 'true',
    coalesce((select (body like '%new.bt_role  is distinct from old.bt_role%')::text from f where proname = 'recheck_alumni_story'), '（函式不存在）'),
    case when (select body from f where proname = 'recheck_alumni_story') like '%new.bt_role  is distinct from old.bt_role%' then 'PASS' else 'FAIL' end
  union all select 5, 'public_alumni() 多回兩欄，名字退路與兩把鑰匙的門照舊', 'true',
    coalesce((select ((body like '%s.bt_role, s.bt_team%') and (body like '%nullif(btrim(p.name_en), ''''), p.name_zh)%') and (body like '%s.public_story and s.story_approved%'))::text from f where proname = 'public_alumni'), '（函式不存在）'),
    case when (select body from f where proname = 'public_alumni') like '%s.bt_role, s.bt_team%'
          and (select body from f where proname = 'public_alumni') like '%nullif(btrim(p.name_en), ''''), p.name_zh)%'
          and (select body from f where proname = 'public_alumni') like '%s.public_story and s.story_approved%' then 'PASS' else 'FAIL' end
  union all select 6, 'stories_for_review() 多回兩欄，門還是 is_senior()', 'true',
    coalesce((select ((body like '%s.bt_role, s.bt_team%') and (body like '%is_senior()%'))::text from f where proname = 'stories_for_review'), '（函式不存在）'),
    case when (select body from f where proname = 'stories_for_review') like '%s.bt_role, s.bt_team%'
          and (select body from f where proname = 'stories_for_review') like '%is_senior()%' then 'PASS' else 'FAIL' end
  union all select 7, '沒登入的人叫得動 public_alumni()、叫不動 stories_for_review()', '1|0',
    (select count(*) from pg_proc p, aclexplode(p.proacl) x where p.proname = 'public_alumni' and x.grantee = 'anon'::regrole and x.privilege_type = 'EXECUTE')::text
    || '|' || (select count(*) from pg_proc p, aclexplode(p.proacl) x where p.proname = 'stories_for_review' and x.grantee = 'anon'::regrole)::text,
    case when (select count(*) from pg_proc p, aclexplode(p.proacl) x where p.proname = 'public_alumni' and x.grantee = 'anon'::regrole and x.privilege_type = 'EXECUTE') = 1
          and (select count(*) from pg_proc p, aclexplode(p.proacl) x where p.proname = 'stories_for_review' and x.grantee = 'anon'::regrole) = 0
    then 'PASS' else 'FAIL' end
) t order by ord;
