-- 創辦人（Founder）：團隊頁 Leadership 那一張上的創辦人　2026-11-24
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 要先跑過 2026-10-24-ranks-and-workspaces.sql（用到 is_president、require_senior）。
--
-- Paul 2026-11-24：「add a Founder position so founders show up」。
-- 同一天問他「已經不在這一屆的創辦人要不要出現」，他選「要，但要本人同意」。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   創辦人不是一屆一屆的職位，是跟著人的一個記號：BT 2020 年成立，創辦人多半已經不在這一屆的名單上，
--   而 positions 是「人 × 屆 × team」，換屆就不見。所以另外開一張表，不動 positions、不動 public_team()。
--
--   1. founders 表：一列一位創辦人（要有帳號）。**前端完全讀寫不到**，只能走下面五支函式。
--   2. 兩把鑰匙，跟團隊頁同一個道理，但各自獨立：
--        Co-President 標記（set_founder）      只有 Co-President。標了不等於公開。
--        本人同意（set_founder_consent）       **只有本人**。函式沒有「替誰勾」的參數，Co-President 也替他勾不了。
--      兩把都轉了，public_founders() 才回這個人。取消標記會連同意一起清掉（重新標要他重新勾）。
--   3. public_founders()：對外。只回 id、中英文名、大頭照。現在是幹部或校友的才回（帳號被改成別的角色就不回）。
--   4. founder_status(person)：後台「改一個人」那一頁印「標了沒、他同意了沒」。Co-President 與 Senior Adviser。
--   5. my_founder()：本人在「我的設定」看自己有沒有被標、勾了沒。
--
-- 沒有動的：profiles、people、positions、public_team()、任何既有的 RLS 政策。
-- 變動紀錄（role_changes）也沒有動：誰標的、什麼時候標的記在 founders 自己那一列（marked_by、marked_at）。
-- 不寫進 role_changes 是因為那張表的欄位清單是一條 check constraint，每加一種就要改它，而舊的遷移檔重跑會把它改回去。
-- ============================================================================

begin;

create table if not exists public.founders (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  marked_by  uuid references public.profiles(id) on delete set null,
  marked_at  timestamptz not null default now(),
  consent    boolean not null default false,
  consent_at timestamptz
);
comment on table public.founders is
  'BT 的創辦人（2026-11-24）。一列一位，要有帳號。marked_by 是標記的 Co-President；consent 只有本人改得動（set_founder_consent）。
   兩個都成立才上對外的團隊頁（public_founders）。前端讀寫不到這張表，沒有任何 RLS 政策。刪帳號時這一列跟著刪。';
alter table public.founders enable row level security;
revoke all on public.founders from public, anon, authenticated;

-- Co-President 標記／取消標記。**這一支永遠不碰 consent 的值**：新標的人 consent 是預設的 false，取消就是整列刪掉。
create or replace function public.set_founder(p_person uuid, p_on boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_profile uuid;
begin
  if not public.is_president() then
    raise exception 'not_president' using errcode = 'P0001';
  end if;
  if not exists (select 1 from people where id = p_person) then
    raise exception 'no_such_person' using errcode = 'P0001';
  end if;
  select profile_id into v_profile from people where id = p_person;
  if v_profile is null then
    -- 沒有帳號的人標不了：同意公開要他自己登入來勾，沒有帳號就沒有人能勾。
    raise exception 'founder_needs_account' using errcode = 'P0001';
  end if;
  if coalesce(p_on, false) then
    insert into founders (profile_id, marked_by) values (v_profile, auth.uid())
    on conflict (profile_id) do nothing;
  else
    delete from founders where profile_id = v_profile;
  end if;
  return coalesce(p_on, false);
end $$;
revoke all on function public.set_founder(uuid, boolean) from public, anon;
grant execute on function public.set_founder(uuid, boolean) to authenticated;

-- 本人同意／收回同意。**沒有 target 參數**：改的永遠是叫這一支的那個人自己的那一列。
create or replace function public.set_founder_consent(p_ok boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  update founders
     set consent = coalesce(p_ok, false),
         consent_at = case when coalesce(p_ok, false) then now() end
   where profile_id = auth.uid();
  if not found then
    raise exception 'not_a_founder' using errcode = 'P0001';
  end if;
  return coalesce(p_ok, false);
end $$;
revoke all on function public.set_founder_consent(boolean) from public, anon;
grant execute on function public.set_founder_consent(boolean) to authenticated;

-- 本人看自己的：有沒有被標、勾了沒。沒登入或沒被標都回 founder = false。
create or replace function public.my_founder()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'founder', exists (select 1 from founders where profile_id = auth.uid()),
    'consent', coalesce((select consent from founders where profile_id = auth.uid()), false));
$$;
revoke all on function public.my_founder() from public, anon;
grant execute on function public.my_founder() to authenticated;

-- 後台「改一個人」那一頁：標了沒、他同意了沒。Co-President 與 Senior Adviser。
create or replace function public.founder_status(p_person uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v_profile uuid;
begin
  perform public.require_senior();
  select profile_id into v_profile from people where id = p_person;
  return jsonb_build_object(
    'founder', exists (select 1 from founders where profile_id = v_profile),
    'consent', coalesce((select consent from founders where profile_id = v_profile), false));
end $$;
revoke all on function public.founder_status(uuid) from public, anon;
grant execute on function public.founder_status(uuid) to authenticated;

-- 對外：Co-President 標了、本人也同意了的創辦人。只有 id、名字、大頭照，沒有 email、沒有任何別的欄位。
create or replace function public.public_founders()
returns table (id uuid, name_zh text, name_en text, avatar text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id, p.name_zh, p.name_en, p.avatar
    from founders f
    join profiles p on p.id = f.profile_id
   where f.consent
     and p.role in ('cadre', 'alumni')
   order by p.name_en, p.name_zh;
$$;
revoke all on function public.public_founders() from public;
grant execute on function public.public_founders() to anon, authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, pronargs, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select
      to_regclass('public.founders') is not null as table_ok,
      (select bool_and(not has_table_privilege(r, 'public.founders', p))
         from unnest(array['anon', 'authenticated']) r, unnest(array['select', 'insert', 'update', 'delete']) p) as private_ok,
      (select relrowsecurity from pg_class where oid = 'public.founders'::regclass)
        and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'founders') = 0 as rls_ok,
      (select array_agg(proname::text order by proname) from fn
        where proname in ('set_founder', 'set_founder_consent', 'my_founder', 'founder_status', 'public_founders')
          and has_function_privilege('anon', oid, 'execute')) as anon_fns,
      (select body like '%is_president()%' and body like '%not_president%' from fn where proname = 'set_founder') as mark_gate,
      (select body not like '%consent%' from fn where proname = 'set_founder') as mark_no_consent,
      (select pronargs = 1 and body like '%where profile_id = auth.uid()%' and body like '%not_a_founder%' from fn where proname = 'set_founder_consent') as consent_self,
      (select body like '%f.consent%' and body like '%p.role in (''cadre'', ''alumni'')%' and body not like '%email%' from fn where proname = 'public_founders') as public_ok,
      (select body like '%require_senior()%' from fn where proname = 'founder_status') as status_gate,
      (select prosrc from pg_proc where proname = 'public_team' and pronamespace = 'public'::regnamespace) not like '%founders%' as team_untouched
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when table_ok and private_ok and rls_ok and anon_fns = array['public_founders'] and mark_gate and mark_no_consent
              and consent_self and public_ok and status_gate and team_untouched
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, 'founders 表在', 'true', table_ok::text, case when table_ok then 'PASS' else 'FAIL' end from t
  union all select 2, '★ founders 表前端讀寫都不行（anon 與登入的人）', 'true', private_ok::text, case when private_ok then 'PASS' else 'FAIL' end from t
  union all select 3, 'founders 表開了 RLS、沒有任何政策', 'true', rls_ok::text, case when rls_ok then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 這一支的函式裡，沒登入叫得到的只有 public_founders', '{public_founders}', coalesce(anon_fns::text, '{}'), case when anon_fns = array['public_founders'] then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 標記創辦人只有 Co-President', 'true', mark_gate::text, case when mark_gate then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 標記那一支完全不碰同意（Co-President 替他勾不了）', 'true', mark_no_consent::text, case when mark_no_consent then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 同意只有本人：沒有「替誰勾」的參數，改的是自己那一列', 'true', consent_self::text, case when consent_self then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 對外只回同意了的、現在是幹部或校友的，沒有 email', 'true', public_ok::text, case when public_ok then 'PASS' else 'FAIL' end from t
  union all select 9, '後台看狀態：Co-President 與 Senior Adviser', 'true', status_gate::text, case when status_gate then 'PASS' else 'FAIL' end from t
  union all select 10, 'public_team() 沒被動到', 'true', team_untouched::text, case when team_untouched then 'PASS' else 'FAIL' end from t
) x order by ord;
