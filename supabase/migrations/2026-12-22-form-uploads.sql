-- 2026-12-22：申請表單的「上傳檔案」題（Paul 2026-11-13：表單要像 Tally，要能上傳檔案）。
-- 接在 2026-12-21-form-received-mail.sql 後面跑。可以重跑。最後印一張驗收表，全 PASS 才算跑成功
-- （本機 smoke 的 Postgres 沒有真的 storage，那幾格印 SKIP）。
--
-- ⚠ **申請人多半是未成年的高中生，這一支的重點是誰讀得到。** 規則只有兩條：
--   讀：只有那份表單改得動的人（form_can_edit，跟後台能改那份表單的是同一批人）。
--       **連上傳的人自己都讀不回來**，沒登入的人、別的學生、其他幹部都讀不到。
--   傳：只能傳進自己的資料夾，而且那份表單現在開著、真的有那一題上傳題、自己還沒送出過。
--   改、刪：沒有政策，等於誰都不能（要清檔案由 Paul 在 Supabase 後台做）。
--
-- 路徑固定是 <表單 id>/<本人 id>/<題目 id>-<亂數>.<副檔名>（shared/forms.js 的 uploadPath）。
-- **不用原本的檔名**：學生上傳的檔名常常就是自己的全名。
-- 每個人每份表單最多 20 個檔，擋的是有人寫程式一直傳把空間塞滿。
--
-- 做了什麼：
--   1. bucket form-uploads：私人（沒有公開網址）、10 MB、只收 PDF、Word、JPG、PNG、WebP。
--   2. form_upload_ok(name)：傳的那一刻的門。form_upload_readable(name)：讀的門。兩支第一句都先問有沒有登入。
--   3. storage.objects 上兩條政策（傳、讀），沒有改與刪。
-- 送出時 form_answer_problem（2026-12-20）另外擋「答案裡的路徑不是自己資料夾的」。
begin;

create or replace function public.form_upload_ok(p_name text)
returns boolean language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_form text := split_part(coalesce(p_name, ''), '/', 1);
  v_file text := split_part(coalesce(p_name, ''), '/', 3);
begin
  if v_uid is null then return false; end if;
  -- 形狀：剛好三段、第二段是本人、沒有 ..、第三段是「題目 id-亂數.副檔名」。
  if split_part(p_name, '/', 2) <> v_uid::text or split_part(p_name, '/', 4) <> '' or p_name like '%..%'
     or substr(v_file, 37, 1) <> '-' or length(v_file) > 80 then
    return false;
  end if;
  -- 那份表單開著（狀態、時間、活動上架）、真的有這一題上傳題。用文字比對，亂打的路徑不會變成轉型錯誤。
  if not exists (
    select 1 from public.forms f join public.form_questions q on q.form_id = f.id
     where f.id::text = v_form and q.id::text = left(v_file, 36) and q.type = 'file'
       and f.status = 'open'
       and (f.opens_at is null or now() >= f.opens_at)
       and (f.closes_at is null or now() <= f.closes_at)
       and public.form_is_listed(f.id)) then
    return false;
  end if;
  -- 送出之後就不能再傳（答案已經定了，多傳的檔沒有人會用到）。
  if exists (select 1 from public.applications a where a.form_id::text = v_form and a.user_id = v_uid) then
    return false;
  end if;
  -- 每個人每份表單最多 20 個檔。
  if to_regclass('storage.objects') is not null then
    if (select count(*) from storage.objects o
         where o.bucket_id = 'form-uploads' and split_part(o.name, '/', 1) = v_form and split_part(o.name, '/', 2) = v_uid::text) >= 20 then
      return false;
    end if;
  end if;
  return true;
end $$;

create or replace function public.form_upload_readable(p_name text)
returns boolean language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return false; end if;
  return coalesce((select public.form_can_edit(f.id) from public.forms f where f.id::text = split_part(coalesce(p_name, ''), '/', 1)), false);
end $$;

-- 政策是用登入的人的身分去叫這兩支，所以 authenticated 要能執行；anon 不行（沒登入一律不准）。
revoke all on function public.form_upload_ok(text), public.form_upload_readable(text) from public, anon;
grant execute on function public.form_upload_ok(text), public.form_upload_readable(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema 不在（本機 smoke 以外不會發生），略過 bucket 與政策';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('form-uploads', 'form-uploads', false, 10485760,
          array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists form_uploads_insert on storage.objects';
  execute 'create policy form_uploads_insert on storage.objects for insert to authenticated with check (bucket_id = ''form-uploads'' and public.form_upload_ok(name))';
  execute 'drop policy if exists form_uploads_read on storage.objects';
  execute 'create policy form_uploads_read on storage.objects for select to authenticated using (bucket_id = ''form-uploads'' and public.form_upload_readable(name))';
  -- 改與刪刻意沒有政策。重跑時把以前可能手動加過的拿掉。
  execute 'drop policy if exists form_uploads_update on storage.objects';
  execute 'drop policy if exists form_uploads_delete on storage.objects';
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, prosecdef, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select (select prosecdef and body like '%v_uid is null then return false%' and body like '%<> v_uid::text%' and body like '%q.type = ''file''%'
                   and body like '%form_is_listed(%' and body like '%from public.applications a%' and body like '%>= 20%' from fn where proname = 'form_upload_ok') as up_gate,
           (select prosecdef and body like '%auth.uid() is null then return false%' and body like '%form_can_edit(%' from fn where proname = 'form_upload_readable') as read_gate,
           not has_function_privilege('anon', 'public.form_upload_ok(text)', 'execute')
             and not has_function_privilege('anon', 'public.form_upload_readable(text)', 'execute') as anon_none,
           to_regclass('storage.buckets') is not null as has_storage
  ),
  s as (
    select t.*,
           case when not has_storage then null
                else (select count(*) = 1 from storage.buckets where id = 'form-uploads' and not public and file_size_limit = 10485760 and array_length(allowed_mime_types, 1) = 6) end as bucket_ok,
           case when not has_storage then null
                else (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'form\_uploads\_%') = 2
                     and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'form_uploads_read' and cmd = 'SELECT' and qual like '%form_upload_readable%')
                     and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'form_uploads_insert' and cmd = 'INSERT' and with_check like '%form_upload_ok%') end as pols_ok
      from t
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when up_gate and read_gate and anon_none and coalesce(bucket_ok, true) and coalesce(pols_ok, true) then 'PASS' else 'FAIL' end as 結果 from s
  union all select 1, '★ 傳的門：本人資料夾、表單開著、真的有上傳題、還沒送出、最多 20 個', 'true', up_gate::text, case when up_gate then 'PASS' else 'FAIL' end from s
  union all select 2, '★ 讀的門：只有那份表單改得動的人', 'true', read_gate::text, case when read_gate then 'PASS' else 'FAIL' end from s
  union all select 3, '★ 沒登入叫不到這兩道門', 'true', anon_none::text, case when anon_none then 'PASS' else 'FAIL' end from s
  union all select 4, '★ bucket form-uploads 是私人的、10 MB、6 種檔', 'true', coalesce(bucket_ok::text, '沒有 storage schema'), case when bucket_ok is null then 'SKIP' when bucket_ok then 'PASS' else 'FAIL' end from s
  union all select 5, '★ 只有兩條政策（傳、讀），沒有改與刪', 'true', coalesce(pols_ok::text, '沒有 storage schema'), case when pols_ok is null then 'SKIP' when pols_ok then 'PASS' else 'FAIL' end from s
) x order by ord;
