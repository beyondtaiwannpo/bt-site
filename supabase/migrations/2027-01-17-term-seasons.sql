-- 一個人在哪幾屆做過事：可以在他的頁面上加、可以寫是哪一季；舊資料庫寫了哪一期的 Board 變成真的那一屆的紀錄（2026-11-26）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 要先跑過 2026-10-26-multi-positions.sql（positions 一個人同一屆可以好幾個 team）、2027-01-06-labels-and-schools.sql（rc_labels 十一種）、
-- 2027-01-08-notes-to-participation.sql（舊備註變成標籤的那一支）。
--
-- Paul 2026-11-26：
--   「before this, it used to be half a year per term… people that is labeled as alumni, we don't get to just choose people and add them into terms.
--     For example, if Andrea works in 2025 6, spring, I should be able to in her page add them into that term, or in terms add people into that.
--     But right now there's nothing connected… they were just old databases that labeled them as board member」
--   「they should appear on that term, and that terms should be connected to the front of the page where in things that says 2025 to 2026 alumni」
-- 同一天問了他兩件事：
--   半年一期怎麼記：他選「照舊一年一屆，另外記是哪一季」（對外的選單本來就是 2025-26 這種一年一屆）。
--   舊資料庫寫了哪一期當 Board 的 52 個人：他選「已經結束的那幾屆的 37 個自動放進去；寫 F26（這一屆）的 15 個不動」。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. positions 多一欄 season（fall 秋季、spring 春季、summer 夏季；空的是整年）。只是記錄，沒有任何一道門看它。
--   2. set_position_season(person, term, team, season)：改一筆職位的那一季。門跟 set_position 一樣（Co-President 與 Senior Adviser）。
--   3. person_terms(person)：紀錄裡一個人的那一頁用。回他每一筆職位（含那一季）、有哪幾屆可以選、現有的 team 名字、這個人能不能改。
--      門是 rc_can_view()（讀得到紀錄的人），讀不到的人拿到 null。加、改、拿掉還是走原本的 set_position／delete_position，門沒有變。
--   4. 舊資料庫的 Board：BT 給的「幹部」標籤，補充說明是「Old database: Board: F23」這種只寫了一期的，
--      而那一期所在的那一屆已經結束、他在那一屆還沒有任何職位：加一筆職位（職位寫「幹部／Member」、沒有 team、那一季照 F 或 S），
--      然後把那個標籤拿掉（同一件事不留兩份，之後要改就改那一筆職位）。拿掉的每一筆寫進 rc_log（label_remove，舊的補充說明留在裡面）。
--      F 是秋季（那一年九月開始，算在那一年開始的那一屆），S 是春季（那一年二月開始，算在前一年開始的那一屆）：F23 與 S24 都是 2023-24。
--      **這一屆（current）的不放**：放了他會變成現任幹部。沒寫哪一期的（Board (term not recorded)）也不動。
--   5. 有職位的來賓算成員：名單上種類是來賓（people.kind = guest，例如先以講者的身分進名單的人）一旦有了任何一屆的職位，種類改成 member。
--      不改的話他在「人與權限 → 屆別」的名單與對外「前幾屆的名單」上都不會出現（那兩個地方只列 member），加了等於沒加。
--      一個 trigger 管之後加的，現有的補一次。**學員（kind = student）不動**：那一格是「現在還在念高中」，要本人或管的人自己取消。
--
-- 對外會不會多出名字：**不會自己多**。前幾屆的名單要 Co-President 在「對外 → 前幾屆的名單」把那一屆打開才會出現（2027-01-11-past-teams.sql 的開關，預設關）。
--   已經打開的那幾屆，這一支放進去的人會跟著出現（只有名字、team、職位）。驗收表第 9 列會寫現在有幾屆是打開的，是 0 就什麼都不會多。
--   未滿 18 歲的人照舊要先在那一頁藏起來。
--
-- 沒有動的：
--   - set_position、delete_position、import_positions、roster()、public_team()、public_past_team()、rc_person()、任何 RLS 政策。
--   - 學員的 people.kind（現在還在念高中那一格）、沒寫哪一期的那 91 個標籤、寫 F26 的那 15 個標籤。
--
-- 要還原第 4 點：從 rc_log 找 what = 'label_remove'、before->>'by' = '2027-01-17-term-seasons' 的那幾列，照 before 裡的 detail 把標籤加回去，
--   再把 title_en = 'Member'、team 是空的、season 不是空的那幾筆職位刪掉。
-- ============================================================================

begin;

-- ---------- 1. 職位多一欄：哪一季 ----------
alter table public.positions add column if not exists season text;
alter table public.positions drop constraint if exists positions_season_check;
alter table public.positions add constraint positions_season_check check (season is null or season in ('fall', 'spring', 'summer'));
comment on column public.positions.season is
  '這一筆職位是那一屆的哪一季（2026-11-26）：fall、spring、summer；空的是整年。BT 以前半年一期，現在一年一屆。只是記錄，沒有任何權限看它。';

-- ---------- 2. 改一筆職位的那一季 ----------
create or replace function public.set_position_season(p_person uuid, p_term text, p_team text, p_season text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_season text := nullif(btrim(coalesce(p_season, '')), '');
begin
  perform public.require_senior();
  if v_season is not null and v_season not in ('fall', 'spring', 'summer') then
    raise exception 'bad_season' using errcode = 'P0001';
  end if;
  update positions set season = v_season
   where person_id = p_person and term_id = p_term and coalesce(team, '') = coalesce(nullif(btrim(p_team), ''), '');
  if not found then
    raise exception 'no_such_position' using errcode = 'P0001';
  end if;
  return true;
end $$;
revoke all on function public.set_position_season(uuid, text, text, text) from public, anon;
grant execute on function public.set_position_season(uuid, text, text, text) to authenticated;

-- ---------- 3. 紀錄裡一個人的那一頁：他在哪幾屆做過事 ----------
create or replace function public.person_terms(p_person uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when public.rc_can_view() then jsonb_build_object(
    'can_edit', public.is_senior(),
    'terms', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'status', t.status) order by t.starts_on desc) from public.terms t), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(x.team order by x.team) from (select distinct po.team from public.positions po where coalesce(po.team, '') <> '') x), '[]'::jsonb),
    'positions', coalesce((select jsonb_agg(jsonb_build_object('term', po.term_id, 'team', po.team, 'title_zh', po.title_zh, 'title_en', po.title_en, 'season', po.season)
                                           order by t.starts_on desc, po.team nulls first)
                             from public.positions po join public.terms t on t.id = po.term_id join public.people pe on pe.id = po.person_id
                            where po.person_id = p_person and pe.forgotten_at is null), '[]'::jsonb))
  else null end;
$$;
revoke all on function public.person_terms(uuid) from public, anon;
grant execute on function public.person_terms(uuid) to authenticated;

-- ---------- 4. 舊資料庫寫了哪一期的 Board：變成那一屆的一筆職位 ----------
do $$
declare r record; v_term text; v_added int := 0; v_gone int := 0;
begin
  for r in
    select g.id, g.person_id, g.detail, g.since_year, g.until_year, regexp_match(g.detail, '^Old database: Board: ([FS])([0-9]{2})(;.*)?$') as m
      from public.rc_labels g join public.people p on p.id = g.person_id
     where g.label = 'member' and p.forgotten_at is null and g.detail ~ '^Old database: Board: [FS][0-9]{2}(;.*)?$'
  loop
    v_term := case when r.m[1] = 'F' then (2000 + r.m[2]::int)::text || '-' || lpad(((r.m[2]::int + 1) % 100)::text, 2, '0')
                   else (2000 + r.m[2]::int - 1)::text || '-' || r.m[2] end;
    -- 那一屆要在、而且已經結束。這一屆的不放。
    if not exists (select 1 from public.terms t where t.id = v_term and t.status = 'ended') then continue; end if;
    -- 他在那一屆已經有職位（有人手動加過）就不再多一筆，但標籤一樣拿掉：那一屆的紀錄已經在了。
    if not exists (select 1 from public.positions po where po.person_id = r.person_id and po.term_id = v_term) then
      insert into public.positions (person_id, term_id, title_zh, title_en, team, season)
      values (r.person_id, v_term, '幹部', 'Member', null, case when r.m[1] = 'F' then 'fall' else 'spring' end);
      v_added := v_added + 1;
    end if;
    delete from public.rc_labels where id = r.id;
    perform public.rc_log_it('label_remove', r.person_id,
      jsonb_build_object('label', 'member', 'detail', r.detail, 'since_year', r.since_year, 'until_year', r.until_year, 'by', '2027-01-17-term-seasons', 'term', v_term), null);
    v_gone := v_gone + 1;
  end loop;
  raise notice '舊資料庫的 Board：加了 % 筆職位，拿掉 % 個標籤', v_added, v_gone;
end $$;

-- ---------- 5. 有職位的來賓算成員 ----------
create or replace function public.positions_guest_to_member_trg()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  update public.people set kind = 'member' where id = new.person_id and kind = 'guest';
  return new;
end $$;
revoke all on function public.positions_guest_to_member_trg() from public, anon, authenticated;
drop trigger if exists positions_guest_to_member on public.positions;
create trigger positions_guest_to_member after insert on public.positions
  for each row execute function public.positions_guest_to_member_trg();
-- 現有的補一次。
update public.people p set kind = 'member'
 where p.kind = 'guest' and p.forgotten_at is null and exists (select 1 from public.positions po where po.person_id = p.id);

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'positions' and column_name = 'season') as col_ok,
      exists (select 1 from pg_constraint where conname = 'positions_season_check' and conrelid = 'public.positions'::regclass) as check_ok,
      (select body like '%require_senior()%' and body like '%bad_season%' and body like '%no_such_position%' from fn where proname = 'set_position_season') as season_gate,
      (select body like '%rc_can_view()%' and body like '%else null end%' and body not like '%email%' from fn where proname = 'person_terms') as terms_gate,
      (select coalesce(array_agg(proname::text order by proname), '{}') from fn
        where proname in ('set_position_season', 'person_terms') and has_function_privilege('anon', oid, 'execute')) as anon_fns,
      public.person_terms('00000000-0000-0000-0000-000000000000') is null as nobody_null,
      -- 已經結束的那幾屆裡，還留著「Old database: Board: 某一期」標籤的人（應該都變成職位了）
      (select count(*)::int from public.rc_labels g join public.people p on p.id = g.person_id, regexp_match(g.detail, '^Old database: Board: ([FS])([0-9]{2})(;.*)?$') m
        where g.label = 'member' and p.forgotten_at is null
          and exists (select 1 from public.terms tt where tt.status = 'ended' and tt.id = case when m[1] = 'F' then (2000 + m[2]::int)::text || '-' || lpad(((m[2]::int + 1) % 100)::text, 2, '0')
                                                                                             else (2000 + m[2]::int - 1)::text || '-' || m[2] end)) as left_over,
      (select count(*)::int from public.rc_log where what = 'label_remove' and before->>'by' = '2027-01-17-term-seasons') as moved,
      -- 搬過去的人裡，那一屆現在沒有職位的（第一次跑完是 0；之後手動拿掉的會算進來，所以只當數字看，不算進 OVERALL）
      (select count(*)::int from public.rc_log l where l.what = 'label_remove' and l.before->>'by' = '2027-01-17-term-seasons'
          and not exists (select 1 from public.positions po where po.person_id = l.ref and po.term_id = l.before->>'term')
          and exists (select 1 from public.people p where p.id = l.ref and p.forgotten_at is null)) as moved_missing,
      -- 這一支加的職位沒有任何一筆在這一屆（放了會變成現任）
      (select count(*)::int from public.positions po join public.terms tt on tt.id = po.term_id
        where tt.status = 'current' and po.title_en = 'Member' and po.team is null and po.season is not null) as in_current,
      (select count(*)::int from public.rc_labels where label = 'member' and detail ~ '^Old database: Board \(term not recorded\)') as no_term_left,
      -- past_public 是 2027-01-11-past-teams.sql 加的欄；那一支還沒跑的資料庫沒有這一欄，當成都沒開。
      (select count(*)::int from public.terms tt where coalesce((to_jsonb(tt)->>'past_public')::boolean, false)) as open_terms,
      (select prosrc from pg_proc where proname = 'set_position' and pronamespace = 'public'::regnamespace) not like '%season%' as set_position_untouched,
      exists (select 1 from pg_trigger where tgname = 'positions_guest_to_member' and tgrelid = 'public.positions'::regclass and not tgisinternal) as trg_ok,
      (select body like '%kind = ''member'' where id = new.person_id and kind = ''guest''%' and body not like '%student%' from fn where proname = 'positions_guest_to_member_trg') as trg_only_guest,
      (select count(*)::int from public.people p where p.kind = 'guest' and p.forgotten_at is null and exists (select 1 from public.positions po where po.person_id = p.id)) as guest_with_pos,
      (select count(*)::int from public.people p where p.kind = 'student' and p.forgotten_at is null and exists (select 1 from public.positions po where po.person_id = p.id)) as student_with_pos
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when col_ok and check_ok and season_gate and terms_gate and anon_fns = '{}' and nobody_null and left_over = 0 and in_current = 0 and set_position_untouched
              and trg_ok and trg_only_guest and guest_with_pos = 0
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, 'positions 多了 season 一欄，只收 fall、spring、summer 或空的', 'true', (col_ok and check_ok)::text, case when col_ok and check_ok then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 改哪一季只有 Co-President 與 Senior Adviser', 'true', coalesce(season_gate, false)::text, case when season_gate then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 一個人在哪幾屆：讀得到紀錄的人才拿得到，沒有 email', 'true', coalesce(terms_gate, false)::text, case when terms_gate then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 這兩支沒登入都叫不到', '{}', anon_fns::text, case when anon_fns = '{}' then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 沒有登入的人（這個視窗）問一個人在哪幾屆，拿到空的', 'true', nobody_null::text, case when nobody_null then 'PASS' else 'FAIL' end from t
  union all select 6, '舊資料庫寫了哪一期的 Board，搬成職位的有幾個人（重跑不會再加）', '', moved::text, 'INFO' from t
  union all select 7, '★ 已經結束的那幾屆，沒有人還留著「Board: 某一期」的標籤', '0', left_over::text, case when left_over = 0 then 'PASS' else 'FAIL' end from t
  union all select 8, '搬過去的人裡，那一屆現在沒有職位的有幾個（第一次跑完是 0；之後有人把那一筆拿掉會算在這裡）', '', moved_missing::text, 'INFO' from t
  union all select 9, '對外「前幾屆的名單」現在打開了幾屆（0 的話，對外一個名字都不會多）', '', open_terms::text, 'INFO' from t
  union all select 10, '★ 這一支加的職位沒有任何一筆落在這一屆', '0', in_current::text, case when in_current = 0 then 'PASS' else 'FAIL' end from t
  union all select 11, '沒寫哪一期的 Board 標籤還有幾個（這一支沒有碰）', '', no_term_left::text, 'INFO' from t
  union all select 12, 'set_position 沒被動到', 'true', set_position_untouched::text, case when set_position_untouched then 'PASS' else 'FAIL' end from t
  union all select 13, '★ 有職位的來賓改成成員的 trigger 在，而且只動來賓（不碰學員）', 'true', (trg_ok and coalesce(trg_only_guest, false))::text, case when trg_ok and trg_only_guest then 'PASS' else 'FAIL' end from t
  union all select 14, '有職位、種類還是來賓的人', '0', guest_with_pos::text, case when guest_with_pos = 0 then 'PASS' else 'FAIL' end from t
  union all select 15, '有職位、但還勾著「現在還在念高中」的人（不會出現在屆別與對外的名單上，只是告訴你有幾個）', '', student_with_pos::text, 'INFO' from t
) x order by ord;
