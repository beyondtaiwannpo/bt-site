-- 後台新增與停用邀請碼。　2026-10-14
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **先跑 2026-10-14-invite-uses.sql**（後台那一頁是那一支建的），
-- 也要先跑過 2026-09-08-students.sql（要用它建的 is_president()）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- 兩支函式，**只有當屆 Co-President 叫得動**：
--   create_invite(碼, 身分, 次數, 備註)   新增一組碼
--   disable_invite(碼)                    停用一組碼（剩餘次數改成 0）
--
-- Paul 2026-10-14 拍板：做新增與停用，**不做刪除**。
-- 理由：刪掉一組碼之後，invite_uses 裡那幾筆紀錄就對不回任何一組碼，
-- 「這個人是拿哪組碼進來的、那組碼原本發給誰」從此查不到。停用就夠了。
--
-- 停用**沒有反悔的按鈕**。要恢復就到 Supabase 的 Table Editor 把 uses_left 改回來。
-- 會停用一組碼，多半是碼被轉給不該拿的人，那時候不該讓人一鍵就恢復。
--
-- ============================================================================
-- 為什麼不直接開放 invite_codes 給 Co-President 寫
-- ============================================================================
-- invite_codes 是「進網站的唯一一道門」，2026-08 起對所有登入身分一律關閉。
-- 開一條 insert / update 政策，等於讓前端可以送任何欄位、任何值進來
-- （例如一組碼 uses_left = 99999）。改成兩支函式：參數有幾個就只能改幾個，
-- 每一個值都在資料庫裡檢查過一次，前端少檢查一樣東西也不會出事。
--
-- ⚠ security definer 的函式不受 RLS 保護。兩支函式第一句都是
-- `if not public.is_president() then raise`，那是唯一的門。驗收表第 3、4 條守這兩句。

begin;

-- ---------- 新增 ----------
-- 回傳實際存進去的碼（去掉前後空白之後的樣子），畫面拿它來說「建好了：…」。
--
-- 碼只准英文字母、數字、連字號，2 到 64 個字。理由：碼是用複製貼上給人的，
-- 中文、空白、全形符號都是「看起來一樣、打起來不一樣」的來源，
-- 而學生打錯時畫面只會說「這個邀請碼不對」，看不出錯在哪。
--
-- 只差在大小寫的碼本來就會被 invite_codes_code_normalized_key 那個唯一索引擋下來，
-- 這裡先查一次，是為了**講得出撞到的是哪一組**（索引擋下來只會說 unique_violation）。
-- 兩個人同時建同一組碼時，先查會兩個都通過，第二個仍然會被索引擋，
-- 所以下面的 exception 把 unique_violation 也翻成同一句話。
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
  if p_grants is null or p_grants not in ('cadre', 'alumni') then
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

-- ---------- 停用 ----------
-- 比對**完全相等**，不做大小寫正規化：參數是從後台清單上那一列拿的原字串，
-- 不是人打的。正規化在這裡只會多一個「停到別組」的可能，沒有好處。
-- 已經是 0 的碼再停用一次不算錯，回 0。
create or replace function public.disable_invite(p_code text)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_president() then
    raise exception 'not_president' using errcode = 'P0001';
  end if;
  update invite_codes set uses_left = 0 where code = p_code;
  if not found then
    raise exception 'no_such_invite' using errcode = 'P0001';
  end if;
  return 0;
end $$;

revoke all on function public.disable_invite(text) from public, anon;
grant execute on function public.disable_invite(text) to authenticated;

commit;

-- ---------- 驗收 ----------
-- 寫法跟 2026-10-14-invite-uses.sql 同一套：先剝掉 SQL 註解再比對本文，
-- 權限一律查 pg_proc.proacl，不用 information_schema。
select * from (
  with cr as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef, proconfig, proacl
      from pg_proc where proname = 'create_invite'
  ), di as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef, proconfig, proacl
      from pg_proc where proname = 'disable_invite'
  ), gate as (
    select
      (select count(*) from cr) = 1 and (select count(*) from di) = 1
      and (select prosecdef from cr) and (select prosecdef from di)
      and coalesce((select array_to_string(proconfig, ',') from cr), '') like '%search_path=%public%'
      and coalesce((select array_to_string(proconfig, ',') from di), '') like '%search_path=%public%' as defs,
      (select body from cr) like '%if not public.is_president() then%raise exception ''not_president''%' as cr_gate,
      (select body from di) like '%if not public.is_president() then%raise exception ''not_president''%' as di_gate,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.proname in ('create_invite', 'disable_invite')
          and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE') as anon_n,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.proname in ('create_invite', 'disable_invite')
          and x.grantee = 'authenticated'::regrole and x.privilege_type = 'EXECUTE') as auth_n,
      (select count(*) from pg_proc where proname in ('delete_invite', 'drop_invite')) as del_n,
      (select count(*) from pg_class c, aclexplode(c.relacl) x
        where c.oid = 'public.invite_codes'::regclass
          and x.grantee in ('anon'::regrole, 'authenticated'::regrole)) as tbl_n
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when defs and cr_gate and di_gate and anon_n = 0 and auth_n = 2 and del_n = 0 and tbl_n = 0
         and (select body from cr) like '%^[A-Za-z0-9-]{2,64}$%'
         and (select body from cr) like '%p_uses > 100%'
         and (select body from cr) like '%upper(btrim(code)) = upper(v_code)%'
    then 'PASS' else 'FAIL' end as 結果 from gate

  union all select 1, '★ 兩支都在、都是 security definer、search_path 釘死', 'true',
    coalesce(defs::text, 'false'), case when defs then 'PASS' else 'FAIL' end from gate

  -- ★ 這兩條是整支最重要的。少了它們，任何登入的人都能發碼給自己升成幹部。
  union all select 3, '★ create_invite 第一件事是確認 Co-President', 'true',
    coalesce(cr_gate::text, 'false'), case when cr_gate then 'PASS' else 'FAIL' end from gate
  union all select 4, '★ disable_invite 第一件事是確認 Co-President', 'true',
    coalesce(di_gate::text, 'false'), case when di_gate then 'PASS' else 'FAIL' end from gate

  union all select 5, '★ 沒登入叫不動這兩支', '0 筆', anon_n::text || ' 筆',
    case when anon_n = 0 then 'PASS' else 'FAIL' end from gate
  -- 對照：沒有它，第 5 條在「誰都叫不動」的時候也會通過，那時候後台的按鈕是壞的。
  union all select 6, '【對照】authenticated 叫得動這兩支', '2 筆', auth_n::text || ' 筆',
    case when auth_n = 2 then 'PASS' else 'FAIL' end from gate

  union all select 7, '★ invite_codes 仍然沒有開放給任何登入身分直接讀寫', '0 筆', tbl_n::text || ' 筆',
    case when tbl_n = 0 then 'PASS' else 'FAIL' end from gate

  union all select 8, '不做刪除（Paul 2026-10-14）', '0 支', del_n::text || ' 支',
    case when del_n = 0 then 'PASS' else 'FAIL' end from gate

  union all select 9, '碼的格式、次數上限、大小寫撞碼都有檢查', 'true',
    ((select body from cr) like '%^[A-Za-z0-9-]{2,64}$%'
      and (select body from cr) like '%p_uses > 100%'
      and (select body from cr) like '%upper(btrim(code)) = upper(v_code)%')::text,
    case when (select body from cr) like '%^[A-Za-z0-9-]{2,64}$%'
          and (select body from cr) like '%p_uses > 100%'
          and (select body from cr) like '%upper(btrim(code)) = upper(v_code)%'
    then 'PASS' else 'FAIL' end
) t order by ord;
