-- 第四種身分 intern（實習生）　2026-10-16
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **要先跑過 2026-10-15-invite-admin.sql**，這一支改寫的是它的 create_invite()
-- 與 2026-10-14-invite-uses.sql 的 claim_invite()。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- Paul 2026-10-15 拍板（docs/2026-10-15-實習生護照盤點與設計.md）：
-- Internship team 每年對外招一批 intern，他們不是幹部，要有自己的一本護照。
-- 這一支只做「身分」那一半：
--   1. profiles.role 多一個合法值 'intern'
--   2. invite_codes.grants 與 invite_uses.grants 多一個合法值 'intern'
--   3. 一支 is_intern()，跟 is_cadre() 同一個形狀
--   4. claim_invite() 認得 intern 碼：升級、建一本實習護照、記一筆使用紀錄
--   5. create_invite() 讓 Co-President 發得出 intern 碼
-- 實習護照的四張表在下一支 2026-10-17-intern-passport.sql。
-- 這一支先跑也沒事：claim_invite() 建實習護照那一句先用 to_regclass 看表在不在，
-- 表還沒建就跳過，升級照樣成功，下一支跑完之後再補那一列（見下面第 4 節）。
--
-- ============================================================================
-- 這一支「不做」什麼
-- ============================================================================
--   **不碰幹部護照的任何一條 RLS。** months、activities、passports、stamps、entries
--   每一條政策仍然只認 is_cadre()，intern 一列都讀不到。這是方案 C 的重點：
--   幹部護照零風險。
--   **不改 profiles.role 的 default**（仍是 'student'）。
--   **不給 intern 任何幹部功能。** 時間看板、申請管理對 intern 一律關著，
--   因為那幾張表的政策全部認 is_cadre()。
--
-- ============================================================================
-- 身分升級的規則（claim_invite）
-- ============================================================================
--   已經是幹部       → 不扣碼，回 already_cadre（跟以前一樣，幹部不降級）
--   拿到的碼跟現在身分一樣（校友拿校友碼、intern 拿 intern 碼）
--                    → 扣了再補回去，回 already_<身分>
--   其他情況         → 換成那組碼給的身分，記一筆 invite_uses
--   intern 拿幹部碼  → 變幹部。他的實習護照那幾列留著，但從此讀不到
--                      （實習護照的政策只認 is_intern() 與 Internship team）。
--                      這是刻意的：一個人同一時間只有一種身分，畫面才不會兩本護照打架。
begin;

-- ---------- 1. profiles.role 多一個值 ----------
-- 原本的 check 是建表時 inline 寫的，Postgres 自動取名 profiles_role_check。
-- 先 drop 再 add，不能 alter。既有的列都是三個舊值，新的 check 包含它們，不會失敗。
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('cadre', 'student', 'alumni', 'intern'));

comment on column public.profiles.role is
  '平台身分：cadre 幹部 / student 學員 / alumni 校友 / intern 實習生（2026-10-16 加）。
   自己註冊出來一律是 student，拿邀請碼呼叫 claim_invite() 才會變。前端改不動這一欄。';

-- ---------- 2. 兩張邀請碼相關的表也多一個值 ----------
alter table public.invite_codes drop constraint if exists invite_codes_grants_check;
alter table public.invite_codes add constraint invite_codes_grants_check
  check (grants in ('cadre', 'alumni', 'intern'));

alter table public.invite_uses drop constraint if exists invite_uses_grants_check;
alter table public.invite_uses add constraint invite_uses_grants_check
  check (grants in ('cadre', 'alumni', 'intern'));

-- ---------- 3. is_intern() ----------
-- 跟 is_cadre() 同一個形狀與同一組理由（security definer 避免 profiles 政策遞迴、
-- stable 讓同一個查詢只算一次、search_path 釘死）。詳細理由在
-- 2026-08-31-profiles-and-role.sql 的 is_cadre() 上面，不重複。
--
-- anon 也發執行權限，理由見 2026-09-14-anon-execute.sql：這支回的是
-- 「呼叫者自己是不是 intern」，沒登入的人一律 false。不發的話，哪天有一條
-- 對外頁面讀得到的政策引用它，沒登入的人整個查詢會失敗而不是讀到零列。
create or replace function public.is_intern()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'intern');
$$;
revoke execute on function public.is_intern() from public;
grant  execute on function public.is_intern() to anon, authenticated;

-- ---------- 4. claim_invite() 認得 intern ----------
-- 以 2026-10-14-invite-uses.sql 那一版為底，只加 intern 那幾行。
-- 不要改 p_code 的名字（理由在 2026-09-01-claim-invite.sql 檔頭：改成 code
-- 會讓比對變成「參數跟自己比」，任何字串都能升級）。
create or replace function public.claim_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   text;
  v_grants text;
  v_code   text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- for update 是防「同一個人連點兩下」的鎖。**不要拿掉。**
  select role into v_role from profiles where id = v_uid for update;
  if v_role is null then
    raise exception 'no_profile' using errcode = 'P0001';
  end if;

  -- 幹部不降級、不扣碼。
  if v_role = 'cadre' then
    return 'already_cadre';
  end if;

  -- 扣碼，同時把這組碼給什麼身分、原本的寫法拿出來。身分來自那一列不來自參數。
  update invite_codes set uses_left = uses_left - 1
   where upper(btrim(code)) = upper(btrim(p_code)) and uses_left > 0
   returning grants, code into v_grants, v_code;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  -- 拿到的身分跟現在一樣：補回次數、回報、不記。
  -- 2026-10-16 起校友與 intern 兩種都走這一條（原本只有校友）。
  if v_role = v_grants then
    update invite_codes set uses_left = uses_left + 1
     where upper(btrim(code)) = upper(btrim(p_code));
    return 'already_' || v_role;
  end if;

  update profiles set role = v_grants where id = v_uid;

  -- 只有幹部有幹部護照，只有 intern 有實習護照。
  if v_grants = 'cadre' then
    insert into passports (id) values (v_uid) on conflict (id) do nothing;
  end if;
  -- 實習護照那張表在下一支遷移檔。表還沒建的話跳過，不讓升級失敗；
  -- 下一支跑完之後，intern 第一次打開護照時前端會發現沒有那一列而顯示
  -- 「請重新輸入邀請碼」，不會卡死（見 intern-passport/src/main.js）。
  -- 不過正常順序是兩支連著跑，這個分支只是保險。
  if v_grants = 'intern' and to_regclass('public.intern_passports') is not null then
    insert into intern_passports (id, term)
    values (v_uid, (select id from intern_terms where active order by starts_on desc limit 1))
    on conflict (id) do nothing;
  end if;

  insert into invite_uses (code, user_id, grants) values (v_code, v_uid, v_grants);

  return case v_grants when 'alumni' then 'upgraded_alumni'
                       when 'intern' then 'upgraded_intern'
                       else 'upgraded' end;
end $$;
revoke execute on function public.claim_invite(text) from public, anon;
grant  execute on function public.claim_invite(text) to authenticated;

-- ---------- 5. create_invite() 發得出 intern 碼 ----------
-- 以 2026-10-15-invite-admin.sql 那一版為底，只改 p_grants 那一句的清單。
create or replace function public.create_invite(p_code text, p_grants text, p_uses int, p_note text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_code  text := btrim(coalesce(p_code, ''));
  v_clash text;
begin
  if not public.is_president() then
    raise exception 'not_president' using errcode = 'P0001';
  end if;
  if v_code !~ '^[A-Za-z0-9-]{2,64}$' then
    raise exception 'bad_invite_code' using errcode = 'P0001';
  end if;
  if p_grants is null or p_grants not in ('cadre', 'alumni', 'intern') then
    raise exception 'bad_grants' using errcode = 'P0001';
  end if;
  if p_uses is null or p_uses < 1 or p_uses > 100 then
    raise exception 'bad_uses' using errcode = 'P0001';
  end if;
  select code into v_clash from invite_codes where upper(btrim(code)) = upper(v_code);
  if found then
    raise exception 'invite_exists:%', v_clash using errcode = 'P0001';
  end if;
  begin
    insert into invite_codes (code, uses_left, grants, note)
    values (v_code, p_uses, p_grants, nullif(btrim(coalesce(p_note, '')), ''));
  exception when unique_violation then
    raise exception 'invite_exists:%', v_code using errcode = 'P0001';
  end;
  return v_code;
end $$;
revoke all on function public.create_invite(text, text, int, text) from public, anon;
grant execute on function public.create_invite(text, text, int, text) to authenticated;

commit;

-- ============================================================================
-- 驗收。全部 PASS 才算跑完。
-- ============================================================================
select * from (
  with ci as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where proname = 'claim_invite'
  ), cr as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where proname = 'create_invite'
  ), ii as (
    select prosecdef, proconfig, proacl from pg_proc where proname = 'is_intern'
  ), rc as (
    select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'profiles_role_check'
  ), gc as (
    select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'invite_codes_grants_check'
  ), uc as (
    select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'invite_uses_grants_check'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when
      (select def from rc) like '%intern%'
      and (select def from gc) like '%intern%'
      and (select def from uc) like '%intern%'
      and (select count(*) from ii) = 1 and (select prosecdef from ii)
      and coalesce((select array_to_string(proconfig, ',') from ii), '') like '%search_path=%public%'
      and (select body from ci) like '%btrim(p_code)%'
      and (select body from ci) like '%for update%'
      and (select body from ci) like '%v_role = v_grants%'
      and (select body from ci) like '%upgraded_intern%'
      and (select body from ci) like '%insert into invite_uses%'
      and (select body from cr) like '%''intern''%'
      and (select body from cr) like '%if not public.is_president() then%'
      and (select count(*) from pg_policies where schemaname = 'public'
            and tablename in ('months','activities','passports','stamps','entries')
            and qual like '%is_intern%') = 0
    then 'PASS' else 'FAIL' end as 結果
  union all select 1, '★ profiles.role 認得 intern', '含 intern',
    coalesce((select def from rc), '（沒有 check）'),
    case when (select def from rc) like '%intern%' then 'PASS' else 'FAIL' end
  union all select 2, '★ 舊的三個值還在', '含 cadre、student、alumni',
    coalesce((select def from rc), '（沒有 check）'),
    case when (select def from rc) like '%cadre%' and (select def from rc) like '%student%'
          and (select def from rc) like '%alumni%' then 'PASS' else 'FAIL' end
  union all select 3, 'invite_codes.grants 認得 intern', '含 intern',
    coalesce((select def from gc), '（沒有 check）'),
    case when (select def from gc) like '%intern%' then 'PASS' else 'FAIL' end
  union all select 4, 'invite_uses.grants 認得 intern', '含 intern',
    coalesce((select def from uc), '（沒有 check）'),
    case when (select def from uc) like '%intern%' then 'PASS' else 'FAIL' end
  union all select 5, 'is_intern() 在，而且是 security definer', 'true',
    coalesce((select prosecdef::text from ii), '（函式不存在）'),
    case when (select prosecdef from ii) then 'PASS' else 'FAIL' end
  union all select 6, '★ claim_invite 的參數還叫 p_code（改名會讓任何字串都能升級）', 'true',
    (select (body like '%btrim(p_code)%')::text from ci),
    case when (select body from ci) like '%btrim(p_code)%' then 'PASS' else 'FAIL' end
  union all select 7, '★ 連點兩下的鎖還在（for update）', 'true',
    (select (body like '%for update%')::text from ci),
    case when (select body from ci) like '%for update%' then 'PASS' else 'FAIL' end
  union all select 8, 'claim_invite 回得出 upgraded_intern', 'true',
    (select (body like '%upgraded_intern%')::text from ci),
    case when (select body from ci) like '%upgraded_intern%' then 'PASS' else 'FAIL' end
  union all select 9, 'create_invite 收 intern，而且門還在', 'true',
    (select (body like '%''intern''%' and body like '%if not public.is_president() then%')::text from cr),
    case when (select body from cr) like '%''intern''%' and (select body from cr) like '%if not public.is_president() then%'
    then 'PASS' else 'FAIL' end
  union all select 10, '★ 幹部護照的五張表一條政策都沒有提到 intern', '0 條',
    (select count(*) from pg_policies where schemaname = 'public'
      and tablename in ('months','activities','passports','stamps','entries')
      and qual like '%is_intern%')::text || ' 條',
    case when (select count(*) from pg_policies where schemaname = 'public'
      and tablename in ('months','activities','passports','stamps','entries')
      and qual like '%is_intern%') = 0 then 'PASS' else 'FAIL' end
) t order by ord;
