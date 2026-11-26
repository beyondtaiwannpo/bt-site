-- 講者卡沒有自己的照片，就用他在名單（People）裡的那一張（2026-11-26）。
--
-- Paul 的原話（對外的活動頁上 Vicky 與 Eva 沒有照片，可是他已經在名單裡幫她們放了）：
--   「Eva and Vicky still shows no picture, while on the backside I have their picture uploaded… I mean in their people, they have their
--    profile picture, but when they're added to the events, their picture is not loaded.」
-- 動手前問了他一件事，他選「Automatic」：講者卡沒有自己的照片時，對外頁自動用名單裡的那一張，不用誰再按一次。
--
-- 原因：對外頁只認講者卡自己存的那一張（event_speakers.photo_url）。名單裡的照片是另一格（rc_profiles.photo_url），
--   只有「加這位講者的當下」名單裡已經有照片才會抄一份過去。先加講者、後來才在名單放照片，那一張就永遠到不了對外頁。
--
-- 這一支做什麼：
--   1. public_event_extras() 重寫一次，只改照片那一格：講者卡有自己的照片就用它（照舊）；
--      沒有、而且這位講者連到名單裡的一個人、那個人有照片，就回名單裡的那一張。
--   2. event_speakers_list()（後台讀講者的那一支）多回一個鍵 people_photo，後台才畫得出對外頁會出現的那一張。
--
-- 誰看得到什麼，改了的只有一件，講清楚：
--   - **名單裡的照片，會跟著「放在對外頁」的講者出現在對外的活動頁上。** 以前要有人抄一次才會出現，現在不用。
--     只有同時符合這三件的人：是某一場上架活動的講者、那一位勾了「放在對外頁」、講者卡連到名單裡的他。名單裡其他一千多個人的照片跟以前一樣不對外。
--   - 這一張照片**不看本人的 share_profile**。照片本來就是講者卡那四樣（名字、主題、學校、照片）之一，放不放是加講者的人決定的，
--     2027-01-02 與 2027-01-07 那兩支就是這樣；本人同意才多回的仍然只有職稱與故事，那兩道門一個字都沒改。
--   - 沒勾「放在對外頁」的講者照舊整位不回。沒上架的活動照舊什麼都不回。被忘記的人（forgotten_at）不帶照片。
--   - 對外那一支回的鍵沒有多：name、subject、school、photo_url，加上本人同意的 job、story。沒有 id、沒有連到名單的 person_id、沒有 email。
--   - 後台那一支的門沒變（can_edit 那場活動的工作區）。people_photo 只在兩種情形回：那一位已經放在對外頁（那一張本來就公開了），
--     或看的人本來就讀得到名單（rc_can_view）。所以改得了活動、讀不到名單的人，不會因為這一支多看到沒公開的講者在名單裡的照片。
--   - 沒有新的表、沒有新的欄位、沒有動 RLS、沒有動 Storage。save_event_speaker 與其他講者函式一行都沒改。
--
-- 還有一件要知道的：講者卡自己的照片贏。以前抄過去的那幾張是抄的當下的樣子，之後在名單換照片它們不會跟著換；
--   要跟著名單走，在後台把那一位講者卡的照片拿掉就好（拿掉之後就用名單裡的）。
--
-- 可以重跑。跑完看最後那張表，每一列都要是 PASS（最後兩列是數字，寫 INFO）。
-- ⚠ 之後如果重跑 2027-01-07-speaker-profiles.sql、2027-01-05-map-links.sql 或 2027-01-02-event-speakers-tickets.sql，要再跑一次這一支，
--   不然這兩支函式會被換回舊的版本（資料不會錯，只是沒有自己照片的講者在對外頁又變回沒有照片）。

begin;

-- ---------- 1. 對外：一場活動的照片、講者、報名類型、地圖連結 ----------
-- 跟 2027-01-07-speaker-profiles.sql 那一版只差 photo_url 那一格。
create or replace function public.public_event_extras(p_slug text)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'photos', coalesce((select jsonb_agg(jsonb_build_object('url', p.url) order by p.sort, p.created_at, p.id)
                          from event_photos p where p.event_id = e.id and p.consent), '[]'::jsonb),
    'speakers', coalesce((select jsonb_agg(jsonb_build_object('name', s.display_name, 'subject', s.subject, 'school', s.school,
                                                              'photo_url', coalesce(s.photo_url,
                                                                 (select ph.photo_url from rc_profiles ph join people pp on pp.id = ph.person_id
                                                                   where ph.person_id = s.person_id and pp.forgotten_at is null and ph.photo_url ~ '^https://')))
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

-- ---------- 2. 後台：讀這一場的講者（含還沒放在對外頁的）----------
-- 跟 2027-01-02-event-speakers-tickets.sql 那一版只多一個鍵 people_photo：這位講者在名單裡的照片（沒連到人、沒有照片、被忘記的都是 null）。
-- 只在那一位已經放在對外頁、或看的人本來就讀得到名單的時候回。
create or replace function public.event_speakers_list(p_event uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare e record; v_view boolean;
begin
  select * into e from events where id = p_event;
  if e.id is null then raise exception 'no_such_event' using errcode = 'P0001'; end if;
  if not public.can_edit(e.workspace_id) then raise exception 'not_event_editor' using errcode = 'P0001'; end if;
  v_view := public.rc_can_view();
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'person_id', s.person_id, 'display_name', s.display_name, 'subject', s.subject,
                                                       'school', s.school, 'photo_url', s.photo_url, 'consent', s.consent, 'sort', s.sort,
                                                       'people_photo', case when s.consent or v_view then
                                                          (select ph.photo_url from rc_profiles ph join people pp on pp.id = ph.person_id
                                                            where ph.person_id = s.person_id and pp.forgotten_at is null and ph.photo_url ~ '^https://') end)
                                    order by s.sort, s.created_at, s.id)
                     from event_speakers s where s.event_id = p_event), '[]'::jsonb);
end $$;
revoke all on function public.event_speakers_list(uuid) from public, anon;
grant execute on function public.event_speakers_list(uuid) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  pub as (select e.id as event_id, sp.v, sp.i
            from public.events e, jsonb_array_elements(coalesce(public.public_event_extras(e.slug)->'speakers', '[]'::jsonb)) with ordinality sp(v, i)
           where e.status = 'published'),
  shown as (select s.event_id, s.photo_url as card, row_number() over (partition by s.event_id order by s.sort, s.created_at, s.id) as i,
                   (select ph.photo_url from public.rc_profiles ph join public.people pp on pp.id = ph.person_id
                     where ph.person_id = s.person_id and pp.forgotten_at is null and ph.photo_url ~ '^https://') as people
              from public.event_speakers s join public.events e on e.id = s.event_id where e.status = 'published' and s.consent),
  t as (
    select
      (select body like '%''photo_url'', coalesce(s.photo_url,%' from fn where proname = 'public_event_extras') as fallback_ok,
      (select body like '%from rc_profiles ph join people pp on pp.id = ph.person_id%where ph.person_id = s.person_id and pp.forgotten_at is null and ph.photo_url ~ ''^https://'')))%'
         from fn where proname = 'public_event_extras') as person_gate,
      (select body like '%from event_speakers s where s.event_id = e.id and s.consent)%' and body like '%where e.slug = p_slug and e.status = ''published''%'
         from fn where proname = 'public_event_extras') as old_gates,
      (select body like '%case when pf.share_profile then%' and body like '%case when pf.share_story then%'
              and body like '%where pf.person_id = s.person_id and pe.forgotten_at is null%' from fn where proname = 'public_event_extras') as consent_gates,
      (select count(*)::int from pub, jsonb_object_keys(pub.v) k where k not in ('name', 'subject', 'school', 'photo_url', 'job', 'story')) as extra_keys,
      (select body like '%if not public.can_edit(e.workspace_id) then raise exception ''not_event_editor''%'
              and body like '%''people_photo'', case when s.consent or v_view then%' and body like '%v_view := public.rc_can_view();%'
         from fn where proname = 'event_speakers_list') as list_ok,
      (select has_function_privilege('anon', oid, 'execute') and has_function_privilege('authenticated', oid, 'execute') from fn where proname = 'public_event_extras')
        and (select not has_function_privilege('anon', oid, 'execute') and has_function_privilege('authenticated', oid, 'execute') from fn where proname = 'event_speakers_list') as grants_ok,
      (select count(*)::int from shown sh left join pub on pub.event_id = sh.event_id and pub.i = sh.i
        where pub.v is null or (pub.v->>'photo_url') is distinct from coalesce(sh.card, sh.people)) as mismatches,
      (select count(*)::int from pub) = (select count(*)::int from shown) as same_count,
      (select count(*)::int from shown where card is null and people is not null) as from_people,
      (select count(*)::int from shown where card is null and people is null) as still_none
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when fallback_ok and person_gate and old_gates and consent_gates and extra_keys = 0 and list_ok and grants_ok and mismatches = 0 and same_count then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 對外：講者卡沒有自己的照片，才用名單裡的那一張（卡上的贏）', 'true', coalesce(fallback_ok, false)::text, case when fallback_ok then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 名單裡的照片只認這位講者連到的那個人；被忘記的人不帶；只收 https', 'true', coalesce(person_gate, false)::text, case when person_gate then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 照舊只回放在對外頁的講者、只回上架的活動', 'true', coalesce(old_gates, false)::text, case when old_gates then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 職稱與故事照舊要本人同意（那兩道門沒有動）', 'true', coalesce(consent_gates, false)::text, case when consent_gates then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 對外回的鍵沒有多（沒有 id、person_id、email）', '0', extra_keys::text, case when extra_keys = 0 then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 後台那一支的門沒變；名單的照片只回給讀得到名單的人，或那一位已經對外', 'true', coalesce(list_ok, false)::text, case when list_ok then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 沒登入的人只叫得到對外那一支', 'true', coalesce(grants_ok, false)::text, case when grants_ok then 'PASS' else 'FAIL' end from t
  union all select 8, '現在每一位對外的講者，回的照片都是「卡上的，沒有才是名單的」（對不上的列數）', '0', mismatches::text, case when mismatches = 0 and same_count then 'PASS' else 'FAIL' end from t
  union all select 9, '（數字）現在有幾位對外的講者，照片是從名單來的', '', from_people::text, 'INFO' from t
  union all select 10, '（數字）還是沒有照片的對外講者有幾位（卡上與名單都沒有）', '', still_none::text, 'INFO' from t
) x order by ord;
