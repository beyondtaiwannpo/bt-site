-- 後台 Marketing 區批 1：接上 BT 的 Instagram 帳號（只讀帳號資料，還不發文）　2026-11-26
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **先做完 docs/2026-10-29-instagram-setup.md**（Meta app、拿通行證、放進 Vault），再跑這支。
-- 沒做完也可以先跑：表與函式都會建好，後台會說「還沒接上」，做完設定不用再跑一次。
-- 要先跑過 2026-10-24-ranks-and-workspaces.sql（用到 can_view、can_manage、is_senior）。
--
-- Paul 2026-10-29：後台要有 Marketing 區，看 IG 貼文與 Reels 的成效，之後也從這裡發大學介紹貼文。
-- 計畫在 ~/Anson/outputs/beyond-taiwan/website/docs/2026-10-29-marketing-dashboard-plan/plan.md，決定記在 ~/Anson/decisions/log.md 2026-10-29。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 一張只有一列的表 ig_connection：接的是哪個帳號、粉絲數、最後一次檢查的時間與錯誤、通行證哪天過期。
--      **通行證本身不在這張表**，只在 Vault（名字 INSTAGRAM_TOKEN）。任何角色都讀不到這張表，要看走 ig_status()。
--   2. ig_check()：用通行證問 Instagram「我是誰」，把帳號名稱、類型、粉絲數、貼文數記下來。
--   3. ig_refresh_if_due()：通行證 60 天過期。剩不到 50 天、而且放進 Vault 超過 25 小時，就換一張新的寫回 Vault。
--      （Instagram 規定通行證至少要 24 小時大才能換。）所以正常情況大約每 10 天換一次，永遠不會過期。
--   4. 每天一次（pg_cron 有開的話）：先看要不要換通行證，再檢查一次。
--   5. 後台用的兩支：ig_status()（Marketing 的人看連線狀態）、ig_check_now()（管的人按「再檢查一次」）。
--
-- 用的是「Instagram API with Instagram Login」（graph.instagram.com），不需要 Facebook 粉專，
-- 只碰 BT 自己的帳號，所以 Meta 的 Standard Access 就夠，不用 App Review。
-- 網址不帶版本號（graph.instagram.com/me）：走 Meta app 預設的版本，換屆的人不用每年改網址。
--
-- 誰看得到：Co-President、Senior Adviser，加上被派進 Marketing 資源工作區（res:Marketing Team）
-- 或行銷需求單工作區（custom:marketing-requests）的人，任何等級。按「再檢查一次」要 res:Marketing Team「管」或 senior。
-- ============================================================================

begin;

create table if not exists public.ig_connection (
  id int primary key default 1 check (id = 1),
  ig_user_id text,
  username text,
  account_type text,
  followers_count int,
  media_count int,
  checked_at timestamptz,
  check_error text,
  token_expires_at timestamptz,
  token_estimated boolean not null default true,   -- true：通行證是人手放進 Vault 的，過期日是用「放進去那天 + 60 天」估的
  token_refreshed_at timestamptz,                  -- 最後一次由這支自動換新的時間
  refresh_error text
);
alter table public.ig_connection enable row level security;
revoke all on public.ig_connection from public, anon, authenticated;
insert into public.ig_connection (id) values (1) on conflict (id) do nothing;

-- ---------- 1. Vault 裡的通行證：id、內容、放進去的時間 ----------
create or replace function public.ig_secret()
returns table (secret_id uuid, token text, set_at timestamptz) language plpgsql security definer stable
set search_path = public, vault, pg_temp
as $$
-- plpgsql 不是 sql：sql 函式建立時就會檢查欄位，沒有 Vault 的資料庫（本機 smoke 的替身）連建都建不起來。
begin
  return query select d.id, btrim(d.decrypted_secret), d.updated_at from vault.decrypted_secrets d
   where d.name = 'INSTAGRAM_TOKEN' and coalesce(btrim(d.decrypted_secret), '') <> ''
   order by d.updated_at desc limit 1;
end $$;
revoke all on function public.ig_secret() from public, anon, authenticated;

-- 準備好了沒：http 擴充套件在、Vault 有通行證。
create or replace function public.ig_ready()
returns boolean language plpgsql security definer stable
set search_path = public, pg_temp
as $$
begin
  if to_regprocedure('extensions.http(extensions.http_request)') is null then return false; end if;
  return exists (select 1 from public.ig_secret());
exception when others then return false;
end $$;
revoke all on function public.ig_ready() from public, anon, authenticated;

-- ---------- 2. 叫 Instagram（GET，逾時 8 秒）。回 (狀態碼, 內容)。 ----------
-- 錯誤訊息裡要是出現通行證，換成 ***，才不會被寫進 ig_connection 給後台看到。
create or replace function public.ig_get(p_path text, p_query text default '')
returns record language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare r record; v_tok text; v_url text;
begin
  select token into v_tok from public.ig_secret();
  v_url := 'https://graph.instagram.com/' || p_path || '?' || case when coalesce(p_query, '') <> '' then p_query || '&' else '' end
        || 'access_token=' || extensions.urlencode(v_tok);
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  select status, content into r from extensions.http(('GET', v_url, '{}'::extensions.http_header[], null, null)::extensions.http_request);
  return (r.status::int, replace(coalesce(r.content::text, ''), v_tok, '***'));
exception when others then
  return (0, replace(sqlerrm, coalesce(v_tok, '§'), '***'));
end $$;
revoke all on function public.ig_get(text, text) from public, anon, authenticated;

-- Instagram 的錯誤長這樣：{"error":{"message":"...","code":190}}。翻成一行「code 190: ...」，後台照代碼講人話。
create or replace function public.ig_error_text(p_status int, p_content text)
returns text language plpgsql immutable
set search_path = public, pg_temp
as $$
declare j jsonb;
begin
  if p_status = 0 then return 'network: ' || left(coalesce(p_content, ''), 200); end if;
  begin j := p_content::jsonb; exception when others then j := null; end;
  if j ? 'error' then
    return 'HTTP ' || p_status || ' code ' || coalesce(j->'error'->>'code', '?') || ': ' || left(coalesce(j->'error'->>'message', ''), 200);
  end if;
  return 'HTTP ' || p_status || ': ' || left(coalesce(p_content, ''), 200);
end $$;
revoke all on function public.ig_error_text(int, text) from public, anon, authenticated;

-- ---------- 3. 檢查：我是誰、粉絲數、貼文數。回 'ok'、'off'（還沒設定）或 'error'（原因寫進 check_error） ----------
create or replace function public.ig_check()
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_status int; v_content text; j jsonb;
begin
  if not public.ig_ready() then return 'off'; end if;
  select * into v_status, v_content from public.ig_get('me', 'fields=user_id,username,account_type,followers_count,media_count') as (s int, c text);
  if v_status <> 200 then
    update public.ig_connection set checked_at = now(), check_error = public.ig_error_text(v_status, v_content) where id = 1;
    return 'error';
  end if;
  j := v_content::jsonb;
  update public.ig_connection set
    ig_user_id = coalesce(j->>'user_id', j->>'id'), username = j->>'username', account_type = j->>'account_type',
    followers_count = (j->>'followers_count')::int, media_count = (j->>'media_count')::int,
    checked_at = now(), check_error = null
   where id = 1;
  return 'ok';
exception when others then
  update public.ig_connection set checked_at = now(), check_error = left(sqlerrm, 300) where id = 1;
  return 'error';
end $$;
revoke all on function public.ig_check() from public, anon, authenticated;

-- ---------- 4. 換通行證。回 'off'、'not_due'、'ok' 或 'error'（原因寫進 refresh_error） ----------
create or replace function public.ig_refresh_if_due()
returns text language plpgsql security definer
set search_path = public, vault, pg_temp
as $$
declare s record; c record; v_status int; v_content text; j jsonb;
begin
  if not public.ig_ready() then return 'off'; end if;
  select * into s from public.ig_secret();
  select * into c from public.ig_connection where id = 1;
  -- Vault 裡的通行證比我們上次自己換的還新：是人手放進去的（第一次設定，或過期之後重拿一張）。
  -- 那張的過期日不知道，用「放進去那天 + 60 天」估，畫面上會寫「大約」。
  if c.token_refreshed_at is null or s.set_at > c.token_refreshed_at + interval '1 minute' then
    update public.ig_connection set token_expires_at = s.set_at + interval '60 days', token_estimated = true, refresh_error = null where id = 1;
    c.token_expires_at := s.set_at + interval '60 days';
  end if;
  -- Instagram 規定：通行證至少 24 小時大才能換。剩超過 50 天就先不換。
  if s.set_at > now() - interval '25 hours' or c.token_expires_at > now() + interval '50 days' then return 'not_due'; end if;
  select * into v_status, v_content from public.ig_get('refresh_access_token', 'grant_type=ig_refresh_token') as (s int, c text);
  if v_status <> 200 then
    update public.ig_connection set refresh_error = public.ig_error_text(v_status, v_content) where id = 1;
    return 'error';
  end if;
  j := v_content::jsonb;
  if coalesce(j->>'access_token', '') = '' then
    update public.ig_connection set refresh_error = 'no access_token in reply' where id = 1;
    return 'error';
  end if;
  -- 新的通行證寫回 Vault（同一個名字、同一筆），舊的那張在過期之前也還能用。
  perform vault.update_secret(s.secret_id, j->>'access_token');
  update public.ig_connection set
    token_expires_at = now() + make_interval(secs => coalesce((j->>'expires_in')::int, 5184000)),
    token_estimated = false, token_refreshed_at = now(), refresh_error = null
   where id = 1;
  return 'ok';
exception when others then
  update public.ig_connection set refresh_error = left(sqlerrm, 300) where id = 1;
  return 'error';
end $$;
revoke all on function public.ig_refresh_if_due() from public, anon, authenticated;

-- 每天一次：先換（要換的話），再檢查。cron 跑的是 postgres 身分，不經過下面的門。
create or replace function public.ig_daily()
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  return public.ig_refresh_if_due() || '/' || public.ig_check();
end $$;
revoke all on function public.ig_daily() from public, anon, authenticated;

-- ---------- 5. 門 ----------
-- 看：senior，或被派進 Marketing 資源工作區、行銷需求單工作區（任何等級）。Paul 2026-10-29「whole Marketing workspace」。
create or replace function public.ig_can_view()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_senior() or public.can_view('res:Marketing Team') or public.can_view('custom:marketing-requests');
$$;
-- 管（按「再檢查一次」，之後的批次還有連線設定）：senior，或 Marketing 資源工作區「管」。
create or replace function public.ig_can_manage()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_senior() or public.can_manage('res:Marketing Team');
$$;
revoke all on function public.ig_can_view(), public.ig_can_manage() from public, anon;
grant execute on function public.ig_can_view(), public.ig_can_manage() to authenticated;

-- ---------- 6. 後台用的兩支 ----------
-- 連線狀態。**不回通行證**，連一個字都不回。
create or replace function public.ig_status()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare c record;
begin
  if not public.ig_can_view() then raise exception 'not_marketing' using errcode = 'P0001'; end if;
  select * into c from public.ig_connection where id = 1;
  return jsonb_build_object(
    'ready', public.ig_ready(),
    'username', c.username, 'account_type', c.account_type,
    'followers', c.followers_count, 'media', c.media_count,
    'checked_at', c.checked_at, 'check_error', c.check_error,
    'expires_at', c.token_expires_at, 'estimated', coalesce(c.token_estimated, true),
    'refreshed_at', c.token_refreshed_at, 'refresh_error', c.refresh_error,
    'cron', exists (select 1 from pg_extension where extname = 'pg_cron'),
    'can_manage', public.ig_can_manage());
end $$;
revoke all on function public.ig_status() from public, anon;
grant execute on function public.ig_status() to authenticated;

-- 再檢查一次（管的人按）。剛設定完、或修好之後不用等明天。
create or replace function public.ig_check_now()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.ig_can_manage() then raise exception 'not_marketing_manager' using errcode = 'P0001'; end if;
  if not public.ig_ready() then raise exception 'ig_not_ready' using errcode = 'P0001'; end if;
  perform public.ig_refresh_if_due();
  perform public.ig_check();
  return public.ig_status();
end $$;
revoke all on function public.ig_check_now() from public, anon;
grant execute on function public.ig_check_now() to authenticated;

-- ---------- 7. 每天一次（pg_cron 有開才排；沒開的話，管的人按「再檢查一次」也會換通行證） ----------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'bt-instagram-daily';
    perform cron.schedule('bt-instagram-daily', '17 3 * * *', 'select public.ig_daily()');
  end if;
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with f as (
    select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef, proconfig
      from pg_proc where pronamespace = 'public'::regnamespace
       and proname in ('ig_secret', 'ig_ready', 'ig_get', 'ig_check', 'ig_refresh_if_due', 'ig_daily', 'ig_can_view', 'ig_can_manage', 'ig_status', 'ig_check_now')
  ), s as (
    select
      (select relrowsecurity from pg_class where oid = 'public.ig_connection'::regclass) as rls,
      (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'ig_connection'
        and grantee in ('anon', 'authenticated', 'PUBLIC')) as tbl_grants,
      (select count(*) from f where prosecdef and array_to_string(proconfig, ',') like '%search_path=%public%') as defs,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('ig_secret', 'ig_ready', 'ig_get', 'ig_check', 'ig_refresh_if_due', 'ig_daily', 'ig_error_text')
          and x.grantee in (0::regrole, 'anon'::regrole, 'authenticated'::regrole) and x.privilege_type = 'EXECUTE') as inner_open,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.pronamespace = 'public'::regnamespace and p.proname in ('ig_status', 'ig_check_now')
          and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE') as anon_n,
      coalesce((select body from f where proname = 'ig_status'), '') like '%if not public.ig_can_view() then raise%' as gate_view,
      coalesce((select body from f where proname = 'ig_check_now'), '') like '%if not public.ig_can_manage() then raise%' as gate_manage,
      coalesce((select body from f where proname = 'ig_status'), '') not like '%secret%' and coalesce((select body from f where proname = 'ig_status'), '') not like '%token,%' as no_token,
      coalesce((select body from f where proname = 'ig_refresh_if_due'), '') like '%25 hours%' as wait_24h,
      coalesce((select body from f where proname = 'ig_get'), '') like '%''***''%' as scrub,
      public.ig_ready() as ready,
      exists (select 1 from pg_extension where extname = 'pg_cron') as cron_on
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when rls and tbl_grants = 0 and defs = 10 and inner_open = 0 and anon_n = 0 and gate_view and gate_manage and no_token and wait_24h and scrub then 'PASS' else 'FAIL' end as 結果 from s
  union all select 1, '★ ig_connection 開了 RLS，沒有任何角色讀得到', 'true|0', rls::text || '|' || tbl_grants, case when rls and tbl_grants = 0 then 'PASS' else 'FAIL' end from s
  union all select 2, '十支函式是 security definer、search_path 釘死', '10', defs::text, case when defs = 10 then 'PASS' else 'FAIL' end from s
  union all select 3, '★ 碰通行證與叫 Instagram 的內部函式，網站上的人都叫不動', '0 筆', inner_open::text || ' 筆', case when inner_open = 0 then 'PASS' else 'FAIL' end from s
  union all select 4, '★ 沒登入叫不動 ig_status、ig_check_now', '0 筆', anon_n::text || ' 筆', case when anon_n = 0 then 'PASS' else 'FAIL' end from s
  union all select 5, '★ 看狀態要是 Marketing 的人', 'true', gate_view::text, case when gate_view then 'PASS' else 'FAIL' end from s
  union all select 6, '★ 再檢查一次要 Marketing「管」或 senior', 'true', gate_manage::text, case when gate_manage then 'PASS' else 'FAIL' end from s
  union all select 7, '★ ig_status 不回通行證', 'true', no_token::text, case when no_token then 'PASS' else 'FAIL' end from s
  union all select 8, '通行證放進去 25 小時內不換（Instagram 規定 24 小時）', 'true', wait_24h::text, case when wait_24h then 'PASS' else 'FAIL' end from s
  union all select 9, '★ 錯誤訊息裡的通行證會被遮掉', 'true', scrub::text, case when scrub then 'PASS' else 'FAIL' end from s
  union all select 10, '資訊：Vault 有沒有 INSTAGRAM_TOKEN（沒有就是設定還沒做完，後台會說還沒接上）', '（看一眼）', case when ready then '有，接上了' else '還沒有' end, 'PASS' from s
  union all select 11, '資訊：pg_cron 有沒有開（沒開的話，管的人按「再檢查一次」也會換通行證）', '（看一眼）', case when cron_on then '開了，每天一次' else '沒開' end, 'PASS' from s
) t order by ord;
