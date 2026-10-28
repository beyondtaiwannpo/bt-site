-- 幹部護照的格子多兩樣：什麼時候辦（一個確定的時間）、一張範例照片。　2026-11-15
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **先跑 2026-11-14-intern-groups.sql**（順序照日期）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- Paul 2026-10-28：「我需要一個確定的時間顯示在上面」「鏡頭那一格要有地方放範例照片」。
--
--   1. activities 多兩欄：happens_at（什麼時候辦，可以空著）、example_url（範例照片的網址，可以空著）。
--      護照上那一格的正面印出時間（照看的人自己的時區）與範例照片。
--   2. set_activity_extras(格子, 時間, 照片網址)：後台改格子那一頁用。
--      照片網址只收這個專案 passport-examples 那個 bucket 的公開網址，別的網址一律擋（不讓護照去載外面的圖）。
--   3. Storage bucket passport-examples：公開讀、5 MB、只收圖。上傳、改、刪只給 passport 工作區「改」以上的人。
--
-- 門：跟改格子同一道，require_ws_edit('passport')。

begin;

alter table public.activities add column if not exists happens_at timestamptz;
alter table public.activities add column if not exists example_url text;

create or replace function public.set_activity_extras(p_id text, p_happens_at timestamptz, p_example_url text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_url text := nullif(btrim(coalesce(p_example_url, '')), '');
begin
  perform public.require_ws_edit('passport');
  if v_url is not null and v_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/passport-examples/[A-Za-z0-9/_.-]+$' then
    raise exception 'bad_example_url' using errcode = 'P0001';
  end if;
  update activities set happens_at = p_happens_at, example_url = v_url where id = p_id;
  if not found then raise exception 'no_such_activity' using errcode = 'P0001'; end if;
  return p_id;
end $$;
revoke all on function public.set_activity_extras(text, timestamptz, text) from public, anon;
grant execute on function public.set_activity_extras(text, timestamptz, text) to authenticated;

commit;

-- bucket passport-examples。本機 Postgres 沒有 storage schema 就整段跳過（驗收表那一列印 SKIP）。
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema 不在（本機 smoke），略過 bucket 與政策';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('passport-examples', 'passport-examples', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists pex_read on storage.objects';
  execute 'create policy pex_read on storage.objects for select to public using (bucket_id = ''passport-examples'')';
  execute 'drop policy if exists pex_insert on storage.objects';
  execute 'create policy pex_insert on storage.objects for insert to authenticated with check (bucket_id = ''passport-examples'' and public.can_edit(''passport''))';
  execute 'drop policy if exists pex_update on storage.objects';
  execute 'create policy pex_update on storage.objects for update to authenticated using (bucket_id = ''passport-examples'' and public.can_edit(''passport''))';
  execute 'drop policy if exists pex_delete on storage.objects';
  execute 'create policy pex_delete on storage.objects for delete to authenticated using (bucket_id = ''passport-examples'' and public.can_edit(''passport''))';
end $$;

-- ---------- 驗收 ----------
select * from (
  with f as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef, proconfig
      from pg_proc where proname = 'set_activity_extras' and pronamespace = 'public'::regnamespace
  ), g as (
    select
      (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'activities' and column_name in ('happens_at', 'example_url')) as cols,
      (select count(*) from f) = 1 and coalesce((select prosecdef from f), false)
        and coalesce((select array_to_string(proconfig, ',') from f), '') like '%search_path=%public%' as defs,
      coalesce((select body from f), '') like '%perform public.require_ws_edit(''passport'')%' as gate,
      coalesce((select body from f), '') like '%bad_example_url%' as url_guard,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.proname = 'set_activity_extras' and x.grantee in (0::regrole, 'anon'::regrole) and x.privilege_type = 'EXECUTE') as anon_n,
      to_regclass('storage.buckets') is not null as has_storage
  ), s as (
    select g.*,
      case when not has_storage then null
           else (select count(*) from storage.buckets where id = 'passport-examples' and public) = 1 end as bucket_ok
      from g
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when cols = 2 and defs and gate and url_guard and anon_n = 0 and coalesce(bucket_ok, true) then 'PASS' else 'FAIL' end as 結果 from s
  union all select 1, 'activities 有 happens_at 與 example_url', '2', cols::text, case when cols = 2 then 'PASS' else 'FAIL' end from s
  union all select 2, 'set_activity_extras 在、是 security definer、search_path 釘死', 'true', defs::text, case when defs then 'PASS' else 'FAIL' end from s
  union all select 3, '★ 第一件事是確認 passport 工作區「改」以上', 'true', gate::text, case when gate then 'PASS' else 'FAIL' end from s
  union all select 4, '★ 照片網址只收自己的 bucket', 'true', url_guard::text, case when url_guard then 'PASS' else 'FAIL' end from s
  union all select 5, '★ 沒登入叫不動', '0 筆', anon_n::text || ' 筆', case when anon_n = 0 then 'PASS' else 'FAIL' end from s
  union all select 6, 'Storage bucket passport-examples（公開讀）', 'true', coalesce(bucket_ok::text, '沒有 storage schema'),
    case when bucket_ok is null then 'SKIP' when bucket_ok then 'PASS' else 'FAIL' end from s
) t order by ord;
