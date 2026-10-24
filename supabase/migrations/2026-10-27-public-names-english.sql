-- 對外頁面不放中文名（Paul 2026-10-24：「對外中文全部 hide out」）。
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- 要先跑過 2026-10-26-multi-positions.sql（這一支改寫的是它建的 public_alumni()）。
--
-- 只改一件事：public_alumni() 回的 name 從「自己填的顯示名 → 中文名 → 英文名」
-- 改成「自己填的顯示名 → 英文名 → 中文名」。其他欄位、門、順序一個字都沒動。
-- 團隊頁那一邊名字的取捨在前端（team/src/ui.js），同一天一起改。
--
-- 校友自己在 /settings/ 填的「公開顯示的名字」仍然優先：那是本人決定要怎麼被叫的，
-- 可以是英文、可以遮字，這一條尊重他的選擇。

begin;

create or replace function public.public_alumni()
returns table (
  id text, name text, school text, county text, city text, country text, place text,
  quote text, note text, school_en text, country_en text, quote_en text, note_en text, title text
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
           group by po.term_id)
    from public.alumni_stories s
    join public.profiles p on p.id = s.id
   where s.public_story and s.story_approved
     and p.role in ('cadre', 'alumni')
     and s.county is not null
   order by s.approved_at nulls last, s.updated_at;
$$;
revoke all on function public.public_alumni() from public;
grant execute on function public.public_alumni() to anon, authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with f as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef
      from pg_proc where proname = 'public_alumni'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when (select count(*) from f) = 1 and (select prosecdef from f)
          and (select body from f) like '%nullif(btrim(p.name_en), ''''), p.name_zh)%'
          and (select body from f) like '%s.public_story and s.story_approved%'
          and (select count(*) from pg_proc p, aclexplode(p.proacl) x
                where p.proname='public_alumni' and x.grantee='anon'::regrole and x.privilege_type='EXECUTE') = 1
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '★ 名字退路是 顯示名 → 英文名 → 中文名', 'true',
    coalesce((select (body like '%nullif(btrim(p.name_en), ''''), p.name_zh)%')::text from f), '（函式不存在）'),
    coalesce((select case when body like '%nullif(btrim(p.name_en), ''''), p.name_zh)%' then 'PASS' end from f), 'FAIL')
  union all select 2, '★ 兩把鑰匙的門還在', 'true',
    coalesce((select (body like '%s.public_story and s.story_approved%')::text from f), '（查不到）'),
    coalesce((select case when body like '%s.public_story and s.story_approved%' then 'PASS' end from f), 'FAIL')
  union all select 3, '沒登入的人叫得動（對外頁要用）', '1 筆',
    (select count(*) from pg_proc p, aclexplode(p.proacl) x
      where p.proname='public_alumni' and x.grantee='anon'::regrole and x.privilege_type='EXECUTE')::text || ' 筆',
    case when (select count(*) from pg_proc p, aclexplode(p.proacl) x
                where p.proname='public_alumni' and x.grantee='anon'::regrole and x.privilege_type='EXECUTE') = 1
    then 'PASS' else 'FAIL' end
) t order by ord;
