-- 後台右下角一顆「回報問題、許願功能」：幹部打字加貼圖，送給 Co-President 與 Senior Adviser（2026-11-25）。
--
-- Paul 的原話：
--   「I need you to build a requesting button on the page, team members can submit bug, features they want through text and pictures
--     and it goes to me like a little folating icon is enough」
-- 他選的三件事（同一天問的）：
--   怎麼送到他手上：後台一頁收件匣，加一封信。
--   誰讀得到：Co-President 與 Senior Adviser。
--   誰看得到那一顆：登入的幹部，在後台與幹部首頁。學生、實習生、校友、對外網站都沒有。
--
-- 這一支做什麼：
--   1. 一張新的表 site_feedback：誰送的、哪一種（問題／想要的功能／其他）、他寫的字、他當時在哪一頁、最多四張圖的路徑、
--      處理到哪（新的／處理中／做好了／不做）、讀的人自己記的一句話。
--      開 RLS、不發任何權限：前端一列都讀不到，全部走下面幾支函式。
--   2. 一個私人的 bucket「feedback」（沒有公開網址、一張 5 MB、只收 JPG、PNG、WebP）。
--      放得進去的：登入的幹部，只能放在自己那個資料夾（路徑第一段是自己的 id），檔名是程式取的那個格式，一天最多 40 張。
--      讀得到的：Co-President、Senior Adviser，還有放的那個人自己。改與刪沒有政策，誰都不行。
--   3. send_feedback(內容)：幹部送一則。檢查種類、字數（1 到 4000）、圖最多四張而且都在自己的資料夾裡。一個人一天最多 30 則。
--      存好之後替每一位 Co-President 與 Senior Adviser 排一封信（送的人自己是其中一位的話不寄給自己），馬上試著寄。
--      信裡有他寫的字與他當時在哪一頁，**沒有圖**，圖要登入後台才看得到。
--   4. feedback_inbox()：Co-President 與 Senior Adviser 讀全部（最新的 300 則）。
--      feedback_set(哪一則, 狀態, 備註)：他們標處理到哪、記一句話。
--      feedback_count()：還沒處理的有幾則（側欄那個數字用的；不是他們的人拿到 0）。
--   5. mail_outbox 的種類多一種 feedback_new。**原本有哪幾種就留哪幾種**：這一支是讀現在的清單再加一個，不是整份重寫。
--
-- 沒有動的：
--   - 沒有動任何既有的表的資料、沒有動既有的 RLS 政策、沒有動寄信那幾支函式（send_pending_mail、mail_render、mail_button_url）。
--     信裡的連結是寫在內文裡的一行字，所以不用改按鈕那一支。
--   - 送的人看不到別人送的，也沒有一頁給他看自己送過的（要的話是下一步）。
--   - 沒有刪除：不做的標「不做」。圖放進去之後沒有人刪得掉（跟其他私人 bucket 一樣）。
--
-- 可以重跑。跑完看最後那張表，每一列都要是 PASS。
-- ⚠ 之後如果重跑任何一支會重建 mail_outbox 種類清單的遷移檔（2026-12-21-form-received-mail.sql 與更早那幾支），
--   要再跑一次這一支，不然 feedback_new 會從清單上不見，送出的時候信排不進去（回報本身還是存得進去，見 send_feedback 裡那一段）。

begin;

-- ---------- 1. 表 ----------
create table if not exists public.site_feedback (
  id          uuid primary key default gen_random_uuid(),
  author      uuid references public.profiles(id) on delete set null,
  kind        text not null check (kind in ('bug', 'feature', 'other')),
  body        text not null check (char_length(body) between 1 and 4000),
  page        text not null default '' check (char_length(page) <= 300),
  photos      text[] not null default '{}' check (cardinality(photos) <= 4),
  status      text not null default 'new' check (status in ('new', 'doing', 'done', 'closed')),
  note        text not null default '' check (char_length(note) <= 2000),
  handled_by  uuid references public.profiles(id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists site_feedback_new on public.site_feedback (created_at desc);
alter table public.site_feedback enable row level security;
revoke all on public.site_feedback from public, anon, authenticated;
comment on table public.site_feedback is
  '幹部從後台右下角那一顆送的回報與許願（2027-01-10）。前端讀不到這張表，送走 send_feedback()，讀走 feedback_inbox()（只有 Co-President 與 Senior Adviser）。
   photos 是私人 bucket「feedback」裡的路徑，第一段是送的人的 id。';

-- ---------- 2. 圖：誰放得進去、誰讀得到 ----------
create or replace function public.feedback_photo_ok(p_name text)
returns boolean language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_name text := coalesce(p_name, '');
begin
  if v_uid is null or not public.is_cadre() then return false; end if;
  -- 路徑只有兩段：自己的 id／程式取的檔名（13 位數的時間加六個字，jpg、png 或 webp）。別人的資料夾、多一層、亂取的檔名都不收。
  if v_name !~ ('^' || v_uid::text || '/[0-9]{13}-[a-z0-9]{6}\.(jpg|png|webp)$') then return false; end if;
  -- 一個人一天最多 40 張。
  if to_regclass('storage.objects') is not null then
    if (select count(*) from storage.objects o
         where o.bucket_id = 'feedback' and split_part(o.name, '/', 1) = v_uid::text and o.created_at > now() - interval '24 hours') >= 40 then
      return false;
    end if;
  end if;
  return true;
end $$;

create or replace function public.feedback_photo_readable(p_name text)
returns boolean language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return false; end if;
  return public.is_senior() or split_part(coalesce(p_name, ''), '/', 1) = auth.uid()::text;
end $$;

-- 政策是用登入的人的身分去叫這兩支，所以 authenticated 要能執行；anon 不行。
revoke all on function public.feedback_photo_ok(text), public.feedback_photo_readable(text) from public, anon;
grant execute on function public.feedback_photo_ok(text), public.feedback_photo_readable(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema 不在（本機 smoke 以外不會發生），略過 bucket 與政策';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('feedback', 'feedback', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists feedback_insert on storage.objects';
  execute 'create policy feedback_insert on storage.objects for insert to authenticated with check (bucket_id = ''feedback'' and public.feedback_photo_ok(name))';
  execute 'drop policy if exists feedback_read on storage.objects';
  execute 'create policy feedback_read on storage.objects for select to authenticated using (bucket_id = ''feedback'' and public.feedback_photo_readable(name))';
  -- 改與刪刻意沒有政策。重跑時把以前可能手動加過的拿掉。
  execute 'drop policy if exists feedback_update on storage.objects';
  execute 'drop policy if exists feedback_delete on storage.objects';
end $$;

-- ---------- 3. 信的種類多一種（讀現在的清單再加一個，原本的一種都不拿掉） ----------
do $$
declare v_name text; v_def text; v_kinds text[];
begin
  select conname, pg_get_constraintdef(oid) into v_name, v_def from pg_constraint
   where conrelid = 'public.mail_outbox'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' limit 1;
  if v_def is null or v_def like '%''feedback_new''%' then return; end if;
  select array_agg(distinct m[1]) into v_kinds from regexp_matches(v_def, '''([a-z_]+)''', 'g') m;
  execute format('alter table public.mail_outbox drop constraint %I', v_name);
  execute 'alter table public.mail_outbox add constraint mail_outbox_kind_check check (kind in ('
    || (select string_agg(quote_literal(k), ', ' order by k) from unnest(v_kinds || array['feedback_new']) k) || '))';
end $$;

-- ---------- 4. 送一則 ----------
create or replace function public.send_feedback(p jsonb)
returns uuid language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid(); v_id uuid; v_name text; v_to text;
  v_kind text := coalesce(p->>'kind', '');
  v_body text := left(btrim(coalesce(p->>'body', '')), 4000);
  v_page text := left(btrim(coalesce(p->>'page', '')), 300);
  v_photos text[] := '{}'; v_one text;
  v_kzh text; v_ken text; v_short text; v_sub text; v_mail text;
begin
  if v_uid is null or not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  if v_kind not in ('bug', 'feature', 'other') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  if v_body = '' then raise exception 'empty_body' using errcode = 'P0001'; end if;
  if jsonb_typeof(p->'photos') = 'array' then
    if jsonb_array_length(p->'photos') > 4 then raise exception 'too_many_photos' using errcode = 'P0001'; end if;
    for v_one in select jsonb_array_elements_text(p->'photos') loop
      -- 只收自己資料夾裡、程式取的那種檔名；有 storage 的時候那個檔還要真的在。
      if v_one !~ ('^' || v_uid::text || '/[0-9]{13}-[a-z0-9]{6}\.(jpg|png|webp)$') then raise exception 'bad_photo' using errcode = 'P0001'; end if;
      if to_regclass('storage.objects') is not null and not exists (select 1 from storage.objects o where o.bucket_id = 'feedback' and o.name = v_one) then
        raise exception 'bad_photo' using errcode = 'P0001';
      end if;
      v_photos := v_photos || v_one;
    end loop;
  end if;
  if (select count(*) from site_feedback f where f.author = v_uid and f.created_at > now() - interval '24 hours') >= 30 then
    raise exception 'too_many_today' using errcode = 'P0001';
  end if;

  insert into site_feedback (author, kind, body, page, photos) values (v_uid, v_kind, v_body, v_page, v_photos) returning id into v_id;

  -- 信：每一位 Co-President 與 Senior Adviser 一封（送的人自己不寄）。信寄不出去、排不進去都不擋這一則：它已經在收件匣裡了。
  begin
    select coalesce(nullif(btrim(coalesce(pr.name_en, '')), ''), nullif(btrim(coalesce(pr.name_zh, '')), ''), '(no name)') into v_name from profiles pr where pr.id = v_uid;
    v_kzh := case v_kind when 'bug' then '問題' when 'feature' then '想要的功能' else '其他' end;
    v_ken := case v_kind when 'bug' then 'a bug' when 'feature' then 'a feature request' else 'a note' end;
    v_short := left(regexp_replace(v_body, '\s+', ' ', 'g'), 40);
    v_sub := '後台回報（' || v_kzh || '）：' || v_short || '　Backstage report (' || v_ken || '): ' || v_short;
    v_mail := v_name || ' 從後台送了一則回報（' || v_kzh || '）。'
      || case when v_page <> '' then E'\n\n' || '他當時在：' || v_page else '' end
      || E'\n\n' || v_body
      || case when cardinality(v_photos) > 0 then E'\n\n' || '附了 ' || cardinality(v_photos) || ' 張圖，登入後台才看得到。' else '' end
      || E'\n\n' || '收件匣：https://beyondtaiwannpo.com/admin/people/#feedback'
      || E'\n\n[[en]]\n'
      || v_name || ' sent ' || v_ken || ' from Backstage.'
      || case when v_page <> '' then E'\n\n' || 'They were on: ' || v_page else '' end
      || E'\n\n' || v_body
      || case when cardinality(v_photos) > 0 then E'\n\n' || cardinality(v_photos) || ' picture(s) attached; sign in to Backstage to see them.' else '' end
      || E'\n\n' || 'Inbox: https://beyondtaiwannpo.com/admin/people/#feedback'
      || public.mail_tail('feedback_new');
    for v_to in
      select u.email from profiles pr join auth.users u on u.id = pr.id
       where pr.role = 'cadre' and pr.board_role in ('president', 'senior_adviser') and pr.id <> v_uid and coalesce(u.email, '') <> ''
    loop
      insert into mail_outbox (to_email, subject, body, kind) values (v_to, v_sub, v_mail, 'feedback_new');
    end loop;
    begin perform public.send_pending_mail(20); exception when others then null; end;
  exception when others then
    raise notice 'feedback mail not queued: %', sqlerrm;
  end;
  return v_id;
end $$;

-- ---------- 5. 讀與標 ----------
create or replace function public.feedback_inbox()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_senior();
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select f.id, f.kind, f.body, f.page, f.photos, f.status, f.note, f.created_at, f.handled_at,
             f.author as author_id,
             coalesce(nullif(btrim(coalesce(a.name_en, '')), ''), nullif(btrim(coalesce(a.name_zh, '')), ''), '') as author_name,
             coalesce(a.team, '') as author_team,
             coalesce(nullif(btrim(coalesce(h.name_en, '')), ''), nullif(btrim(coalesce(h.name_zh, '')), ''), '') as handled_by_name
        from site_feedback f
        left join profiles a on a.id = f.author
        left join profiles h on h.id = f.handled_by
       order by f.created_at desc limit 300) x), '[]'::jsonb);
end $$;

create or replace function public.feedback_set(p_id uuid, p_status text, p_note text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_senior();
  if p_status not in ('new', 'doing', 'done', 'closed') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  update site_feedback set status = p_status, note = left(btrim(coalesce(p_note, '')), 2000),
         handled_by = case when p_status = 'new' then null else auth.uid() end,
         handled_at = case when p_status = 'new' then null else now() end
   where id = p_id;
  if not found then raise exception 'no_such_feedback' using errcode = 'P0001'; end if;
  return p_status;
end $$;

create or replace function public.feedback_count()
returns int language sql stable security definer
set search_path = public, pg_temp
as $$ select case when public.is_senior() then (select count(*)::int from site_feedback where status = 'new') else 0 end $$;

revoke all on function public.send_feedback(jsonb), public.feedback_inbox(), public.feedback_set(uuid, text, text), public.feedback_count() from public, anon;
grant execute on function public.send_feedback(jsonb), public.feedback_inbox(), public.feedback_set(uuid, text, text), public.feedback_count() to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, prosecdef, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select
      (select relrowsecurity from pg_class where oid = 'public.site_feedback'::regclass) as rls_on,
      (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'site_feedback') as table_policies,
      (select count(*)::int from information_schema.role_table_grants where table_schema = 'public' and table_name = 'site_feedback' and grantee in ('anon', 'authenticated', 'PUBLIC')) as table_grants,
      (select body like '%not public.is_cadre() then raise exception ''not_cadre''%' and body like '%bad_kind%' and body like '%empty_body%' and body like '%too_many_photos%'
              and body like '%too_many_today%' and body like '%v_uid::text || ''/[0-9]{13}-[a-z0-9]{6}%' from fn where proname = 'send_feedback') as send_ok,
      (select body like '%pr.board_role in (''president'', ''senior_adviser'')%' and body like '%pr.id <> v_uid%' and body like '%''feedback_new''%' from fn where proname = 'send_feedback') as mail_to_seniors,
      (select bool_and(body like '%perform public.require_senior()%') from fn where proname in ('feedback_inbox', 'feedback_set')) as senior_gates,
      (select body like '%when public.is_senior() then%' from fn where proname = 'feedback_count') as count_gate,
      (select body like '%not public.is_cadre() then return false%' and body like '%v_uid::text || ''/[0-9]{13}-[a-z0-9]{6}%' from fn where proname = 'feedback_photo_ok') as photo_in_ok,
      (select body like '%public.is_senior() or split_part(coalesce(p_name, ''''), ''/'', 1) = auth.uid()::text%' from fn where proname = 'feedback_photo_readable') as photo_read_ok,
      (select coalesce(array_agg(proname::text order by proname), '{}') from fn
        where proname in ('send_feedback', 'feedback_inbox', 'feedback_set', 'feedback_count', 'feedback_photo_ok', 'feedback_photo_readable') and has_function_privilege('anon', oid, 'execute')) as anon_fns,
      (select case when to_regclass('storage.buckets') is null then null
                else (select count(*) = 1 from storage.buckets where id = 'feedback' and not public and file_size_limit = 5242880 and array_length(allowed_mime_types, 1) = 3) end) as bucket_ok,
      (select case when to_regclass('storage.objects') is null then null
                else (select coalesce(string_agg(policyname || ':' || cmd, ',' order by policyname), '') from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'feedback\_%') end) as storage_policies,
      (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.mail_outbox'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' limit 1) as kinds
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when rls_on and table_policies = 0 and table_grants = 0 and send_ok and mail_to_seniors and senior_gates and count_gate and photo_in_ok and photo_read_ok
              and anon_fns = '{}' and coalesce(bucket_ok, true) and coalesce(storage_policies, 'feedback_insert:INSERT,feedback_read:SELECT') = 'feedback_insert:INSERT,feedback_read:SELECT'
              and kinds like '%''feedback_new''%' and kinds like '%''request_new''%' and kinds like '%''received''%' and kinds like '%''guardian''%' and kinds like '%''meeting_invite''%'
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 表開了 RLS、沒有任何政策、沒有發任何權限（前端一列都讀不到）', 'true|0|0', rls_on::text || '|' || table_policies || '|' || table_grants,
                   case when rls_on and table_policies = 0 and table_grants = 0 then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 送：只有幹部，種類、字數、圖（最多四張、只收自己資料夾的）、一天幾則都有檢查', 'true', coalesce(send_ok, false)::text, case when send_ok then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 信只排給 Co-President 與 Senior Adviser，送的人自己不寄', 'true', coalesce(mail_to_seniors, false)::text, case when mail_to_seniors then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 讀全部、標狀態：只有 Co-President 與 Senior Adviser', 'true', coalesce(senior_gates, false)::text, case when senior_gates then 'PASS' else 'FAIL' end from t
  union all select 5, '還沒處理的有幾則：不是他們的人拿到 0', 'true', coalesce(count_gate, false)::text, case when count_gate then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 圖放得進去的：幹部，只能放自己的資料夾、程式取的檔名', 'true', coalesce(photo_in_ok, false)::text, case when photo_in_ok then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 圖讀得到的：Co-President、Senior Adviser、放的那個人自己', 'true', coalesce(photo_read_ok, false)::text, case when photo_read_ok then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 這六支沒登入的人一支都叫不到', '{}', anon_fns::text, case when anon_fns = '{}' then 'PASS' else 'FAIL' end from t
  union all select 9, '★ bucket feedback 是私人的、5 MB、三種圖', 'true', coalesce(bucket_ok::text, '沒有 storage schema'), case when coalesce(bucket_ok, true) then 'PASS' else 'FAIL' end from t
  union all select 10, '★ 圖只有放與讀兩條政策，改與刪沒有', 'feedback_insert:INSERT,feedback_read:SELECT', coalesce(storage_policies, '沒有 storage schema'),
                   case when coalesce(storage_policies, 'feedback_insert:INSERT,feedback_read:SELECT') = 'feedback_insert:INSERT,feedback_read:SELECT' then 'PASS' else 'FAIL' end from t
  union all select 11, '★ 信的種類多了 feedback_new，原本的都還在', 'true',
                   (kinds like '%''feedback_new''%' and kinds like '%''request_new''%' and kinds like '%''received''%' and kinds like '%''guardian''%' and kinds like '%''meeting_invite''%')::text,
                   case when kinds like '%''feedback_new''%' and kinds like '%''request_new''%' and kinds like '%''received''%' and kinds like '%''guardian''%' and kinds like '%''meeting_invite''%' then 'PASS' else 'FAIL' end from t
) x order by ord;
