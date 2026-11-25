-- 對外的活動頁：講者可以點開看他的經歷；後台找人的時候看得到中文名與英文名（2026-11-25）。
--
-- Paul 的原話：
--   「on the outfront pages, like right now, it says speaker Emily, Yale University. It's not attractive at all.
--     I want people to be able to click it and then see their experience. If they have one, obviously, out there.」
--   「when we're searching for a speaker, for example, if I type Alicia, can you show their Chinese or like their important information as well?…
--     if they have a Chinese name and last name, I should know in that.」
--
-- 這一支做什麼：
--   1. public_event_extras() 重寫一次：每一位講者除了原本四樣（名字、主題、學校、照片），**他本人同意的才多回兩樣**：
--        job   他現在的職稱與單位。只有他在個人連結上勾了「BT 可以公開我的名字、照片跟職稱」（share_profile）才回。
--        story 他寫的那六題故事。只有他勾了「BT 可以引用我寫的故事」（share_story）才回，而且只回有寫的那幾題。
--      兩樣都要這張講者卡連得到紀錄裡的那個人（person_id）、那個人沒有被移除。沒連到人、他沒勾、他沒寫，就跟以前一樣只有四樣。
--      其他一行沒改：活動上架了才回、講者要勾了「放在對外頁」才回、照片要同意才回、報名類型與地圖連結照舊。
--   2. rc_find_people() 重寫一次：每一個人多回 name_zh、name_en 兩格（原本只回一個 name）。門沒有變（rc_can_view），找法沒有變。
--
-- 沒有動的：
--   - 沒有新的表、沒有新的欄位、沒有動 RLS。同意只有本人勾得了，這一支沒有碰（rc_public_profile_save）。
--   - 個人檔案裡「一段介紹」（bio）與專長領域**不對外**：他同意的那一句寫的是名字、照片跟職稱，沒有寫介紹。要放得先改那一句同意的字。
--   - 聯絡方式、城市、他舉的手（願意演講、願意當 mentor）一樣不對外。
--   - 還在念高中的學員開不了個人連結，所以勾不了這兩個同意，不會走到這裡。
--
-- 可以重跑。跑完看最後那張表，每一列都要是 PASS。
-- ⚠ 之後如果重跑 2027-01-05-map-links.sql、2027-01-02-event-speakers-tickets.sql 或 2027-01-03-people-network.sql，要再跑一次這一支，
--   不然 public_event_extras 與 rc_find_people 會被換回舊的版本（資料還在，只是對外頁點不開、後台看不到中文名）。

begin;

-- ---------- 1. 對外：一場活動的照片、講者、報名類型、地圖連結 ----------
create or replace function public.public_event_extras(p_slug text)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'photos', coalesce((select jsonb_agg(jsonb_build_object('url', p.url) order by p.sort, p.created_at, p.id)
                          from event_photos p where p.event_id = e.id and p.consent), '[]'::jsonb),
    'speakers', coalesce((select jsonb_agg(jsonb_build_object('name', s.display_name, 'subject', s.subject, 'school', s.school, 'photo_url', s.photo_url)
                                           || coalesce((select jsonb_strip_nulls(jsonb_build_object(
                                                          'job', case when pf.share_profile then nullif(concat_ws(', ', nullif(btrim(pf.job_title), ''), nullif(btrim(pf.job_org), '')), '') end,
                                                          'story', case when pf.share_story then nullif(coalesce((select jsonb_object_agg(k.key, btrim(k.value)) from jsonb_each_text(pf.story) k
                                                                                                                    where k.key in ('highschool', 'turning', 'hardest', 'decision', 'wish17', 'first_step') and btrim(k.value) <> ''), '{}'::jsonb), '{}'::jsonb) end))
                                                          from rc_profiles pf join people pe on pe.id = pf.person_id
                                                         where pf.person_id = s.person_id and pe.forgotten_at is null), '{}'::jsonb)
                                           order by s.sort, s.created_at, s.id)
                            from event_speakers s where s.event_id = e.id and s.consent), '[]'::jsonb),
    'tickets', public.event_tickets_public(e.id),
    'map_url', e.map_url)
    from events e
   where e.slug = p_slug and e.status = 'published';
$$;
revoke all on function public.public_event_extras(text) from public;
grant execute on function public.public_event_extras(text) to anon, authenticated;

-- ---------- 2. 後台找人：多回中文名與英文名 ----------
-- 跟 2027-01-03-people-network.sql 那一版只差那兩個鍵。
create or replace function public.rc_find_people(p_q text)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when public.rc_can_view() then coalesce((
    select jsonb_agg(jsonb_build_object('id', pe.id, 'name', public.rc_person_name(pe.id), 'kind', pe.kind, 'school', pe.school, 'grad_year', pe.grad_year, 'has_account', pe.profile_id is not null,
             'name_zh', coalesce((select nullif(btrim(pr.name_zh), '') from public.profiles pr where pr.id = pe.profile_id), nullif(btrim(pe.name_zh), '')),
             'name_en', coalesce((select nullif(btrim(pr.name_en), '') from public.profiles pr where pr.id = pe.profile_id), nullif(btrim(pe.name_en), '')),
             'labels', public.rc_label_codes(pe.id),
             'card', (select jsonb_build_object('field', pf.field, 'job_title', pf.job_title, 'job_org', pf.job_org, 'photo_url', pf.photo_url) from public.rc_profiles pf where pf.person_id = pe.id),
             'latest', (select o.institution from public.rc_outcomes o where o.person_id = pe.id and o.visibility <> 'private' order by o.year desc nulls last, o.recorded_at desc limit 1)) order by public.rc_person_name(pe.id))
      from (select * from public.people pe
             where pe.forgotten_at is null and (
               trim(coalesce(p_q, '')) = ''
               or pe.name_zh ilike '%' || trim(p_q) || '%' or pe.name_en ilike '%' || trim(p_q) || '%'
               or (public.rc_can_manage() and exists (select 1 from public.rc_identities i where i.person_id = pe.id and i.value ilike '%' || trim(p_q) || '%')))
             order by pe.created_at desc limit 50) pe), '[]'::jsonb) else '[]'::jsonb end;
$$;
revoke all on function public.rc_find_people(text) from public, anon;
grant execute on function public.rc_find_people(text) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select
      (select body like '%e.status = ''published''%' and body like '%p.consent%' and body like '%s.event_id = e.id and s.consent%' and body like '%''map_url'', e.map_url%' and body like '%event_tickets_public(e.id)%'
         from fn where proname = 'public_event_extras') as old_gates,
      (select body like '%case when pf.share_profile then%' and body like '%case when pf.share_story then%' from fn where proname = 'public_event_extras') as consent_gates,
      (select body like '%pf.person_id = s.person_id and pe.forgotten_at is null%' from fn where proname = 'public_event_extras') as person_gate,
      (select body not like '%pf.bio%' and body not like '%pf.city%' and body not like '%pf.country%' and body not like '%pf.field%' and body not like '%contact%' and body not like '%rel_%'
              and body not like '%s.person_id,%' and body not like '%''person_id''%' and body not like '%pe.name_%' and body not like '%email%'
         from fn where proname = 'public_event_extras') as nothing_else,
      (select body like '%public.rc_can_view()%' and body like '%''name_zh''%' and body like '%''name_en''%' and body like '%pe.forgotten_at is null%' and body like '%limit 50%' from fn where proname = 'rc_find_people') as find_ok,
      (select coalesce(array_agg(proname::text order by proname), '{}') from fn
        where proname in ('public_event_extras', 'rc_find_people') and has_function_privilege('anon', oid, 'execute')) as anon_fns,
      (select count(*) from public.public_events() x join public.events e on e.slug = x.slug where e.status <> 'published') = 0 as list_untouched,
      -- 整個資料庫掃一次：對外回的講者裡，有 job 的那個人一定勾了 share_profile，有 story 的一定勾了 share_story。
      (select count(*)::int from public.events e, jsonb_array_elements(coalesce(public.public_event_extras(e.slug)->'speakers', '[]'::jsonb)) with ordinality sp(v, i)
        where e.status = 'published' and (sp.v ? 'job' or sp.v ? 'story')
          and not exists (select 1 from public.event_speakers s join public.rc_profiles pf on pf.person_id = s.person_id join public.people pe on pe.id = s.person_id
                           where s.event_id = e.id and s.consent and s.display_name = sp.v->>'name' and pe.forgotten_at is null
                             and (not (sp.v ? 'job') or pf.share_profile) and (not (sp.v ? 'story') or pf.share_story))) as leaks
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when old_gates and consent_gates and person_gate and nothing_else and find_ok and anon_fns = array['public_event_extras'] and list_untouched and leaks = 0
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 對外原本的門都還在：上架了才回、講者要勾了才回、照片要同意', 'true', coalesce(old_gates, false)::text, case when old_gates then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 職稱要他本人勾了 share_profile、故事要他勾了 share_story 才回', 'true', coalesce(consent_gates, false)::text, case when consent_gates then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 要連得到紀錄裡那個人，而且那個人沒有被移除', 'true', coalesce(person_gate, false)::text, case when person_gate then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 介紹、領域、城市、聯絡方式、關係、全名、person_id 一樣都不對外', 'true', coalesce(nothing_else, false)::text, case when nothing_else then 'PASS' else 'FAIL' end from t
  union all select 5, '後台找人：門還是 rc_can_view，多回 name_zh 與 name_en', 'true', coalesce(find_ok, false)::text, case when find_ok then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 這兩支裡沒登入叫得到的只有 public_event_extras', '{public_event_extras}', anon_fns::text, case when anon_fns = array['public_event_extras'] then 'PASS' else 'FAIL' end from t
  union all select 7, '對外的活動清單沒有被動到（只回上架的）', 'true', list_untouched::text, case when list_untouched then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 現在對外回的講者裡，沒有任何一位的職稱或故事是他沒同意的', '0', leaks::text, case when leaks = 0 then 'PASS' else 'FAIL' end from t
) x order by ord;
