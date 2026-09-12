-- 校友專用邀請碼。　2026-09-11
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- invite_codes 多一欄 grants，說這組碼發出去會變成什麼身分：'cadre' 或 'alumni'。
-- 預設 'cadre'，所以**既有的每一組碼行為完全不變**——現有資料表跑完這一支之後，
-- 每一列的 grants 都會是 'cadre'，跟今天的行為一模一樣。
--
-- 為什麼身分由碼決定、不由使用者選：讓人自己選一定有人選錯，而選錯是權限問題。
-- 前端因此仍然沒有任何一條「設定角色」的路徑（規格 §3-5 第 4 點）。角色永遠只能
-- 透過 claim_invite() 改，而 claim_invite() 只看碼上那一欄，不看任何前端傳來的值
-- （這個函式的參數只有一個 p_code，沒有身分參數可以傳）。
--
-- ============================================================================
-- claim_invite() 多兩條分支：五種身分組合怎麼走
-- ============================================================================
-- 原本只有「student 或 cadre」兩種角色，現在多了 alumni，一組碼可以是 cadre 碼
-- 或 alumni 碼，排列組合變成五種：
--
--   角色 \ 碼      cadre 碼              alumni 碼
--   --------      --------------------  --------------------------------
--   student       升級成 cadre，建護照   升級成 alumni，**不建護照**
--                 → 'upgraded'          → 'upgraded_alumni'
--   cadre         已經是幹部，不扣碼     已經是幹部，不扣碼、**不降級**
--                 → 'already_cadre'     → 'already_cadre'
--   alumni        升級成 cadre，建護照   已經是校友，把扣掉的碼補回去
--                 → 'upgraded'          → 'already_alumni'
--
-- 「幹部拿校友碼不降級」：cadre 那個分支在讀完角色後直接 return，比對 grants
-- 之前就結束了，所以完全不看那組碼是什麼身分，也**不扣碼**——手滑點到一組
-- 校友碼不該讓幹部的權限變小，也不該平白燒掉一組校友名額。
--
-- 「校友拿校友碼要把扣掉的碼補回去」：因為要先扣碼才知道這組碼是什麼身分
-- （身分存在 invite_codes 那一列，不是存在碼的字面上），所以無法在扣之前
-- 先判斷「這是重複升級」。於是先扣、再判斷、判斷出是重複的話馬上補回去。
-- 兩句 update 中間有 for update 那把鎖擋著，同一個人不會在這個空檔看到
-- 補碼前的狀態再扣第二次。
--
-- ============================================================================
-- 兩個競態的防法，一個字都沒有改
-- ============================================================================
-- for update 鎖自己那一列（防同一個人連點兩下）
-- update ... where uses_left > 0 加 if not found（防兩個人搶同一組碼）
-- 理由見 2026-09-01-claim-invite.sql 的檔頭，這裡不重複。
--
-- ⚠ 參數仍然必須叫 p_code。改成 code 的話下面那句比對會變成「拿參數跟自己比」，
-- 恆為真，任何字串都能把自己升級 —— 而且不會報錯。

begin;

alter table public.invite_codes add column if not exists grants text not null default 'cadre';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invite_codes_grants_check') then
    alter table public.invite_codes add constraint invite_codes_grants_check
      check (grants in ('cadre', 'alumni'));
  end if;
end $$;

comment on column public.invite_codes.grants is
  '這組碼用掉之後那個人變成什麼身分：cadre（預設）或 alumni。
   校友沒有護照，所以 claim_invite() 只有 cadre 那條路會建 passports 那一列。';

-- ---------- claim_invite 改寫 ----------
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
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  -- for update 是防「同一個人連點兩下」的那道鎖，見上面檔頭。**不要拿掉。**
  select role into v_role from profiles where id = v_uid for update;

  if v_role is null then
    raise exception 'no_profile' using errcode = 'P0001';
  end if;

  -- 已經是幹部：**不扣碼**，直接回報。手滑按兩下不該燒掉一組碼。
  -- 幹部拿校友碼也走這一條 —— 不降級，那會是一個沒有人預期的副作用。
  if v_role = 'cadre' then
    return 'already_cadre';
  end if;

  -- 扣碼，**同時把這組碼給什麼身分拿出來**。身分來自那一列，不是來自參數，
  -- 所以前端就算亂傳也改變不了結果。
  update invite_codes set uses_left = uses_left - 1
   where upper(btrim(code)) = upper(btrim(p_code)) and uses_left > 0
   returning grants into v_grants;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  -- 已經是校友又拿了一組校友碼：這裡已經扣掉了，把它補回去再回報。
  -- （放在扣碼之後是因為要先知道這組碼給什麼身分；校友拿幹部碼是正常的升級，
  --   不會走進這個分支。）
  if v_role = 'alumni' and v_grants = 'alumni' then
    update invite_codes set uses_left = uses_left + 1
     where upper(btrim(code)) = upper(btrim(p_code));
    return 'already_alumni';
  end if;

  update profiles set role = v_grants where id = v_uid;

  -- **只有幹部有護照。** 校友走不到這一行。
  -- on conflict do nothing：這個人可能曾經是幹部、被降級、又升回來。
  if v_grants = 'cadre' then
    insert into passports (id) values (v_uid) on conflict (id) do nothing;
  end if;

  return case when v_grants = 'alumni' then 'upgraded_alumni' else 'upgraded' end;
end $$;

-- 只有登入的人能呼叫。anon 不行，public 不行。這句本來就在，重跑一次沒有副作用。
revoke execute on function public.claim_invite(text) from public, anon;
grant  execute on function public.claim_invite(text) to authenticated;

commit;

-- ---------- 驗收 ----------
-- 查 prosrc 的幾條一律先把 SQL 註解剝掉再比對，理由見 2026-09-01-claim-invite.sql：
-- 這個 repo 的註解會解釋規則本身，不剝的話註解會餵飽比對式。
--
-- ⚠ 權限那兩條（10、11）**不用 information_schema.column_privileges /
-- routine_privileges**。那兩個檢視只列出「跟目前這個使用者有關」的授權，
-- 在 SQL Editor 用某些身分執行時會安靜地回零列，讓「沒有發給任何人」跟
-- 「查不到、所以看起來是沒有」變成同一個結果——一個因為看不到而通過的
-- 安全檢查，比沒有檢查更糟。改成直接查系統目錄：
--   欄位權限用 pg_attribute + aclexplode(attacl)
--   函式權限用 pg_proc + aclexplode(proacl)
-- attacl / proacl 是 null 時代表「只有擁有者有權限」，aclexplode(null) 回零列，
-- 那正是我們要的答案（沒有發給任何人），所以這個寫法在兩種情況下都對。
select * from (
  with src as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc where proname = 'claim_invite'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when
      (exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='invite_codes'
                  and column_name='grants'))
      and coalesce((select column_default from information_schema.columns
                     where table_schema='public' and table_name='invite_codes'
                       and column_name='grants'), '') like '%cadre%'
      and (exists (select 1 from pg_constraint where conname = 'invite_codes_grants_check'))
      and (select body from src) like '%btrim(p_code)%'
      and (select body from src) like '%for update%'
      and (select body from src) like '%uses_left > 0%'
      and (select body from src) like '%returning grants%'
      and (select body from src) like '%v_grants = ''cadre''%'
      and (select body from src) like '%insert into passports%'
      and (select body from src) like '%uses_left = uses_left + 1%'
      and (select body from src) like '%upgraded_alumni%'
      and (select body from src) like '%already_alumni%'
      and (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='claim_invite' and p.prosecdef) = 1
      and (select count(*) from pg_proc where proname='claim_invite'
            and 'search_path=public, pg_temp' = any(proconfig)) = 1
      and (select count(*) from pg_attribute a, aclexplode(a.attacl) x
            where a.attrelid='public.profiles'::regclass and a.attname='role'
              and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE') = 0
      and (select count(*) from pg_proc p, aclexplode(p.proacl) x
            where p.proname='claim_invite'
              and x.grantee in (0::regrole, 'anon'::regrole)
              and x.privilege_type='EXECUTE') = 0
    then 'PASS' else 'FAIL' end as 結果

  union all select 1, 'invite_codes 有 grants 欄位', 'true',
    (exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='invite_codes'
                and column_name='grants'))::text,
    case when exists (select 1 from information_schema.columns
                        where table_schema='public' and table_name='invite_codes'
                          and column_name='grants')
    then 'PASS' else 'FAIL' end

  union all select 2, 'grants 的預設仍是 cadre', 'cadre',
    coalesce((select column_default from information_schema.columns
               where table_schema='public' and table_name='invite_codes'
                 and column_name='grants'), '（無）'),
    case when coalesce((select column_default from information_schema.columns
                          where table_schema='public' and table_name='invite_codes'
                            and column_name='grants'), '') like '%cadre%'
    then 'PASS' else 'FAIL' end

  union all select 3, 'grants 只能是 cadre 或 alumni（check constraint）', '有',
    case when exists (select 1 from pg_constraint where conname = 'invite_codes_grants_check')
         then '有' else '沒有' end,
    case when exists (select 1 from pg_constraint where conname = 'invite_codes_grants_check')
    then 'PASS' else 'FAIL' end

  union all select 4, '★ 參數名仍然是 p_code', 'true',
    (select (body like '%btrim(p_code)%')::text from src),
    (select case when body like '%btrim(p_code)%' then 'PASS' else 'FAIL' end from src)

  union all select 5, '★ 防連點兩下那把鎖還在', 'true',
    (select (body like '%for update%')::text from src),
    (select case when body like '%for update%' then 'PASS' else 'FAIL' end from src)

  union all select 6, '★ 防搶碼那句還在', 'true',
    (select (body like '%uses_left > 0%')::text from src),
    (select case when body like '%uses_left > 0%' then 'PASS' else 'FAIL' end from src)

  union all select 7, '★ 身分來自那一列（returning grants）', 'true',
    (select (body like '%returning grants%')::text from src),
    (select case when body like '%returning grants%' then 'PASS' else 'FAIL' end from src)

  union all select 8, '★ 只有 cadre 建護照', 'true',
    (select (body like '%v_grants = ''cadre''%' and body like '%insert into passports%')::text from src),
    (select case when body like '%v_grants = ''cadre''%' and body like '%insert into passports%'
                  then 'PASS' else 'FAIL' end from src)

  union all select 9, '★ 校友重複拿校友碼會把碼補回去', 'true',
    (select (body like '%uses_left = uses_left + 1%')::text from src),
    (select case when body like '%uses_left = uses_left + 1%' then 'PASS' else 'FAIL' end from src)

  union all select 10, '★ role 仍然不是使用者改得動的欄位', '0 筆',
    (select count(*) from pg_attribute a, aclexplode(a.attacl) x
      where a.attrelid='public.profiles'::regclass and a.attname='role'
        and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE')::text || ' 筆',
    case when (select count(*) from pg_attribute a, aclexplode(a.attacl) x
                where a.attrelid='public.profiles'::regclass and a.attname='role'
                  and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE') = 0
    then 'PASS' else 'FAIL' end

  union all select 11, 'anon 仍然叫不動 claim_invite', '0 筆',
    (select count(*) from pg_proc p, aclexplode(p.proacl) x
      where p.proname='claim_invite'
        and x.grantee in (0::regrole, 'anon'::regrole)
        and x.privilege_type='EXECUTE')::text || ' 筆',
    case when (select count(*) from pg_proc p, aclexplode(p.proacl) x
                where p.proname='claim_invite'
                  and x.grantee in (0::regrole, 'anon'::regrole)
                  and x.privilege_type='EXECUTE') = 0
    then 'PASS' else 'FAIL' end

  -- ★ Task 3 的前端認的是這四個字串，不是這支函式「做了什麼」。
  --   把回傳值打錯成別的字（例如 'ok_alumni'）不會讓上面任何一條變紅，
  --   因為那幾條守的是行為（扣碼、補碼、建護照），不是回傳的字面。
  union all select 12, '★ 回傳字串裡有 upgraded_alumni', 'true',
    (select (body like '%upgraded_alumni%')::text from src),
    (select case when body like '%upgraded_alumni%' then 'PASS' else 'FAIL' end from src)

  union all select 13, '★ 回傳字串裡有 already_alumni', 'true',
    (select (body like '%already_alumni%')::text from src),
    (select case when body like '%already_alumni%' then 'PASS' else 'FAIL' end from src)

  -- 這支檔案用 create or replace function 整個重建了 claim_invite，
  -- 所以 2026-09-01-claim-invite.sql 驗收表裡守的這兩條也要在這裡重新守一次
  -- ——貼這支檔案的人沒有理由回去重跑 9 月 1 日那一支。
  union all select 14, 'claim_invite 是 security definer', 'true',
    coalesce((select prosecdef::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' and p.proname='claim_invite'), '（函式不存在）'),
    case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.proname='claim_invite' and p.prosecdef) = 1
    then 'PASS' else 'FAIL' end

  union all select 15, 'search_path 釘死了', 'search_path=public, pg_temp',
    coalesce((select array_to_string(proconfig, ' | ') from pg_proc where proname='claim_invite'), '（沒設）'),
    case when (select count(*) from pg_proc where proname='claim_invite'
                and 'search_path=public, pg_temp' = any(proconfig)) = 1
    then 'PASS' else 'FAIL' end
) x order by ord;

-- ============================================================================
-- 跑完之後怎麼發一組校友碼
-- ============================================================================
-- Table Editor → invite_codes → Insert row，四欄：
--   code       bt-alumni-01
--   uses_left  1
--   grants     alumni      ← 不填的話是幹部碼
--   note       給 2024 屆的誰
