-- 邀請碼的使用紀錄，給 /admin/ 的「邀請碼」分頁看。　2026-10-14
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **先跑 2026-09-17-invite-grants.sql**（這一支改寫它的 claim_invite()），
-- 也要先跑過 2026-09-08-students.sql（要用它建的 is_president()）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- 1. 建一張 invite_uses，每次有人用一組碼**真的換到身分**就記一筆：
--    哪組碼、誰、換成什麼身分、什麼時間。
-- 2. claim_invite() 換身分成功的那兩條路各多寫一筆紀錄。其他一個字都沒改。
-- 3. 一支 invite_codes_for_review()，回每一組碼、剩幾次、使用紀錄，
--    **只有當屆 Co-President 叫得動**。
--
-- Paul 2026-10-14 拍板：只有 Co-President 看得到，第一版只做看，
-- 後台**不能**新增、修改、刪除邀請碼。發新碼照舊走 README「怎麼發新邀請碼」。
--
-- ============================================================================
-- ⚠ 跑這一支之前用掉的那幾次，查不回來
-- ============================================================================
-- 在這之前 claim_invite() 只把 uses_left 減一，沒有留下是誰用的。
-- 所以跑完之後後台的紀錄是從今天開始，**不是**完整的歷史。
-- 不要試著從 profiles.role 回推「應該是哪組碼」——一個人可能拿過兩組碼，
-- 猜錯的紀錄比沒有紀錄更糟，因為看的人會相信它。
--
-- ============================================================================
-- 什麼算「用掉一次」
-- ============================================================================
-- 只有 claim_invite() 回 'upgraded' 或 'upgraded_alumni' 的那兩條路會記。
--   'already_cadre'   幹部再輸入一次：沒扣碼，不記。
--   'already_alumni'  校友拿校友碼：扣了又補回去，不記。
--   'invalid_invite'  碼不對或用完了：raise 之後整筆回滾，連紀錄一起不見。
-- 這樣紀錄的筆數就會等於這組碼真的被扣掉的次數（從今天起算）。
--
-- ============================================================================
-- 這張表誰讀得到
-- ============================================================================
-- **誰都讀不到，連 Co-President 也不能直接查這張表。** RLS 打開、一條 policy
-- 都不給、再把 anon 與 authenticated 的權限全部收回，跟 invite_codes 同一套。
-- 唯一的出口是下面那支 security definer 函式，門寫在它的本文裡。
--
-- 為什麼不直接給 Co-President 一條讀取政策：後台要顯示的是「姓名加 email」，
-- 而校友那幾列的 profiles 學員與幹部都讀不到（理由見 2026-09-19-stories-for-review.sql），
-- email 更是在 auth.users 裡。在函式裡一次解析好，權限集中在一個看得到的地方，
-- 不必為了這一頁去鬆動 profiles 的讀取政策。
--
-- user_id 指到 profiles 並且 on delete cascade：學員或校友從「設定」刪掉自己的帳號時
-- （delete_my_account()），他的使用紀錄跟著消失。後台那組碼的「有紀錄的使用」
-- 會少一筆，剩餘次數不會變。這是刻意的：刪帳號的承諾是「我的資料不留在你們那邊」。

begin;

create table if not exists public.invite_uses (
  id       bigint generated always as identity primary key,
  -- 存的是 invite_codes 那一列**原本的寫法**（claim_invite 用 returning 拿回來的），
  -- 不是使用者打的字。使用者打小寫或多空白，這裡還是對得回那一組碼。
  -- 不設外鍵：碼被刪掉之後，誰用過它的紀錄仍然有意義。
  code     text not null,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  grants   text not null check (grants in ('cadre', 'alumni')),
  used_at  timestamptz not null default now()
);

create index if not exists invite_uses_code_idx on public.invite_uses (code);

comment on table public.invite_uses is
  '每一次用邀請碼換到身分的紀錄。2026-10-14 起才有，之前用掉的查不到。
   只有 claim_invite() 會寫，只有 invite_codes_for_review() 會讀。';

alter table public.invite_uses enable row level security;
-- 故意一條 policy 都不給。
revoke all on public.invite_uses from anon, authenticated;

-- ---------- claim_invite 改寫：換身分成功時多記一筆 ----------
-- 跟 2026-09-17-invite-grants.sql 那一版比，只多了兩件事：
--   returning 多拿 code（要記的是那一列原本的寫法）
--   最後多一句 insert into invite_uses
-- 兩個競態的防法（for update 鎖、uses_left > 0 加 if not found）一個字都沒有動。
--
-- ⚠ 參數仍然必須叫 p_code。改成 code 的話下面那句比對會變成「拿參數跟自己比」，
-- 恆為真，任何字串都能把自己升級 —— 而且不會報錯。
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

  -- for update 是防「同一個人連點兩下」的那道鎖。**不要拿掉。**
  select role into v_role from profiles where id = v_uid for update;

  if v_role is null then
    raise exception 'no_profile' using errcode = 'P0001';
  end if;

  -- 已經是幹部：**不扣碼**，也不記紀錄。
  if v_role = 'cadre' then
    return 'already_cadre';
  end if;

  -- 扣碼，同時把這組碼給什麼身分、原本怎麼寫拿出來。
  update invite_codes set uses_left = uses_left - 1
   where upper(btrim(code)) = upper(btrim(p_code)) and uses_left > 0
   returning grants, code into v_grants, v_code;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  -- 已經是校友又拿了一組校友碼：補回去，不記紀錄（等於沒用掉）。
  if v_role = 'alumni' and v_grants = 'alumni' then
    update invite_codes set uses_left = uses_left + 1
     where upper(btrim(code)) = upper(btrim(p_code));
    return 'already_alumni';
  end if;

  update profiles set role = v_grants where id = v_uid;

  -- **只有幹部有護照。** 校友走不到這一行。
  if v_grants = 'cadre' then
    insert into passports (id) values (v_uid) on conflict (id) do nothing;
  end if;

  -- 這一次真的用掉了。跟上面的扣碼在同一筆交易裡，任何一句失敗會一起回滾，
  -- 所以不會出現「扣了碼卻沒有紀錄」或「有紀錄卻沒扣碼」。
  insert into invite_uses (code, user_id, grants) values (v_code, v_uid, v_grants);

  return case when v_grants = 'alumni' then 'upgraded_alumni' else 'upgraded' end;
end $$;

revoke execute on function public.claim_invite(text) from public, anon;
grant  execute on function public.claim_invite(text) to authenticated;

-- ---------- 後台讀的那一支 ----------
-- 欄位名刻意跟 admin/src/ui.js 的 inviteCodesHTML() 讀的 key 一模一樣。
-- uses 是一個 JSON 陣列，每個元素 {name, email, role, grants, used_at}，最新的在前。
--
-- ⚠ security definer 的函式不受 RLS 保護，**`where public.is_president()` 是唯一的門。**
-- 少了它，任何登入的人都讀得到每一組邀請碼與每一位使用者的 email。驗收表第 3 條守這一句。
--
-- 名字的退路跟 namesOf() 一樣：中文名、英文名、都沒有就「（沒有名字）」。
-- role 是這個人**現在**的身分，grants 是**那一次**換到的身分；
-- 兩個不一樣代表他之後又換過（例如校友後來拿幹部碼升成幹部）。
create or replace function public.invite_codes_for_review()
returns table (
  code text, grants text, uses_left int, note text, created_at timestamptz, uses jsonb
) language sql security definer stable
set search_path = public, pg_temp
as $$
  select c.code, c.grants, c.uses_left, c.note, c.created_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'name',    coalesce(nullif(btrim(p.name_zh), ''), nullif(btrim(p.name_en), ''), '（沒有名字）'),
                    'email',   u.email,
                    'role',    p.role,
                    'grants',  x.grants,
                    'used_at', x.used_at)
                  order by x.used_at desc)
             from public.invite_uses x
             join public.profiles p on p.id = x.user_id
             left join auth.users u on u.id = x.user_id
            where x.code = c.code
         ), '[]'::jsonb)
    from public.invite_codes c
   where public.is_president()
   order by c.created_at desc nulls last, c.code;
$$;

comment on function public.invite_codes_for_review() is
  '/admin/ 邀請碼分頁。只有 Co-President 叫得動（門寫在函式本文裡的
   is_president()，因為 security definer 不受 RLS 保護）。只讀，不改任何東西。';

revoke all on function public.invite_codes_for_review() from public, anon;
grant execute on function public.invite_codes_for_review() to authenticated;

commit;

-- ---------- 驗收 ----------
-- 寫法跟 2026-09-19-stories-for-review.sql 同一套：先剝掉 SQL 註解再比對本文，
-- 權限一律查 pg_proc.proacl / pg_class.relacl，不用 information_schema
-- （那些檢視在某些身分下會安靜地回零列，讓「沒發給任何人」跟「看不到」變成同一個結果）。
select * from (
  with rv as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body,
           prosecdef, proconfig, proargnames
      from pg_proc where proname = 'invite_codes_for_review'
  ), ci as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc where proname = 'claim_invite'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when
      (select count(*) from rv) = 1
      and (select prosecdef from rv)
      and coalesce((select array_to_string(proconfig, ',') from rv), '') like '%search_path=%public%'
      and (select body from rv) like '%where public.is_president()%'
      and (select array_to_string(proargnames, ',') from rv)
          = 'code,grants,uses_left,note,created_at,uses'
      and (select count(*) from pg_proc p, aclexplode(p.proacl) x
            where p.proname='invite_codes_for_review'
              and x.grantee in (0::regrole, 'anon'::regrole)
              and x.privilege_type='EXECUTE') = 0
      and (select count(*) from pg_proc p, aclexplode(p.proacl) x
            where p.proname='invite_codes_for_review' and x.grantee='authenticated'::regrole
              and x.privilege_type='EXECUTE') = 1
      and (select relrowsecurity from pg_class where oid = 'public.invite_uses'::regclass)
      and (select count(*) from pg_policy where polrelid = 'public.invite_uses'::regclass) = 0
      and (select count(*) from pg_class c, aclexplode(c.relacl) x
            where c.oid = 'public.invite_uses'::regclass
              and x.grantee in ('anon'::regrole, 'authenticated'::regrole)) = 0
      and (select body from ci) like '%insert into invite_uses%'
      and (select body from ci) like '%btrim(p_code)%'
      and (select body from ci) like '%for update%'
      and (select body from ci) like '%uses_left > 0%'
      and (select body from ci) like '%uses_left = uses_left + 1%'
    then 'PASS' else 'FAIL' end as 結果

  union all select 1, '★ 讀取函式在，而且是 security definer', 'true',
    coalesce((select prosecdef::text from rv), '（函式不存在）'),
    case when (select prosecdef from rv) then 'PASS' else 'FAIL' end

  union all select 2, '★ search_path 釘死了', '含 search_path=public',
    coalesce((select array_to_string(proconfig, ',') from rv), '（沒有釘）'),
    case when coalesce((select array_to_string(proconfig, ',') from rv), '')
              like '%search_path=%public%'
    then 'PASS' else 'FAIL' end

  -- ★ 整支最重要的一條。錨點連 where 一起比對：改成別的寫法（例如挪到 select 清單裡
  --   變成一個布林欄位）門就開了，只找函式名的話這一條還會是綠的。
  union all select 3, '★ 本文裡真的有 where public.is_president()（唯一的門）', 'true',
    coalesce((select (body like '%where public.is_president()%')::text from rv), '（查不到）'),
    coalesce((select case when body like '%where public.is_president()%' then 'PASS' end from rv), 'FAIL')

  union all select 4, '★ 回傳的欄位名跟後台讀的 key 一樣', 'code,grants,uses_left,note,created_at,uses',
    coalesce((select array_to_string(proargnames, ',') from rv), '（查不到）'),
    case when (select array_to_string(proargnames, ',') from rv) = 'code,grants,uses_left,note,created_at,uses'
    then 'PASS' else 'FAIL' end

  union all select 5, '★ 沒登入的人叫不動讀取函式', '0 筆',
    (select count(*) from pg_proc p, aclexplode(p.proacl) x
      where p.proname='invite_codes_for_review'
        and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type='EXECUTE')::text || ' 筆',
    case when (select count(*) from pg_proc p, aclexplode(p.proacl) x
                where p.proname='invite_codes_for_review'
                  and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type='EXECUTE') = 0
    then 'PASS' else 'FAIL' end

  -- 對照：沒有它，第 5 條在「誰都叫不動」的時候也會通過，那時候後台是空的，不是安全的。
  union all select 6, '【對照】authenticated 叫得動讀取函式', '1 筆',
    (select count(*) from pg_proc p, aclexplode(p.proacl) x
      where p.proname='invite_codes_for_review' and x.grantee='authenticated'::regrole
        and x.privilege_type='EXECUTE')::text || ' 筆',
    case when (select count(*) from pg_proc p, aclexplode(p.proacl) x
                where p.proname='invite_codes_for_review' and x.grantee='authenticated'::regrole
                  and x.privilege_type='EXECUTE') = 1
    then 'PASS' else 'FAIL' end

  union all select 7, '★ invite_uses 開了 RLS 而且沒有任何 policy', 'true / 0 條',
    (select relrowsecurity::text from pg_class where oid = 'public.invite_uses'::regclass) || ' / ' ||
    (select count(*) from pg_policy where polrelid = 'public.invite_uses'::regclass)::text || ' 條',
    case when (select relrowsecurity from pg_class where oid = 'public.invite_uses'::regclass)
          and (select count(*) from pg_policy where polrelid = 'public.invite_uses'::regclass) = 0
    then 'PASS' else 'FAIL' end

  union all select 8, '★ anon 與 authenticated 對 invite_uses 沒有任何表權限', '0 筆',
    (select count(*) from pg_class c, aclexplode(c.relacl) x
      where c.oid = 'public.invite_uses'::regclass
        and x.grantee in ('anon'::regrole, 'authenticated'::regrole))::text || ' 筆',
    case when (select count(*) from pg_class c, aclexplode(c.relacl) x
                where c.oid = 'public.invite_uses'::regclass
                  and x.grantee in ('anon'::regrole, 'authenticated'::regrole)) = 0
    then 'PASS' else 'FAIL' end

  union all select 9, '★ claim_invite 會寫紀錄', 'true',
    coalesce((select (body like '%insert into invite_uses%')::text from ci), '（查不到）'),
    coalesce((select case when body like '%insert into invite_uses%' then 'PASS' end from ci), 'FAIL')

  -- 2026-09-17 那一支守的四句，改寫之後還要在。
  union all select 10, '★ claim_invite 的參數仍是 p_code、鎖與防搶碼還在、補碼還在', 'true',
    coalesce((select (body like '%btrim(p_code)%' and body like '%for update%'
                      and body like '%uses_left > 0%' and body like '%uses_left = uses_left + 1%')::text from ci), '（查不到）'),
    coalesce((select case when body like '%btrim(p_code)%' and body like '%for update%'
                           and body like '%uses_left > 0%' and body like '%uses_left = uses_left + 1%'
                      then 'PASS' end from ci), 'FAIL')
) t order by ord;
