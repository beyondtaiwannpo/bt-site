-- 行銷需求單　2026-10-31
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- **要先跑過 2026-10-30-applications-org-wide.sql**（順序照日期）。
--
-- Paul 2026-10-24：「其他 team 要跟 Marketing 提需求，要有一張表單，送出去給 Marketing team。」
-- 設計在 docs/2026-10-24-行銷需求單.md。三題 Paul 都照建議：送單當下就寄信、改狀態要「改」以上、送單的人在「新的」時可以收回。
-- **不碰申請表那套（forms / applications）**，那是給外面的學生用的。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 一張表 requests：種類、標題、給哪個活動、什麼時候要、說明、素材連結、聯絡方式、送單的人、狀態、回覆。
--   2. 一個工作區 custom:marketing-requests（Marketing 那一列），建好把 res:Marketing Team 現在的成員照原等級抄一份進來。
--   3. 信的種類多 request_new、request_done；mail_outbox 多一欄 request_id；兩封預設文案（Paul 改過的不會被蓋）。
--   4. 三支函式：submit_request()（幹部送單，排信給工作區裡每個「管」的人，然後直接寄）、
--      set_request_status()（「改」以上改狀態寫回覆，變成 done 就排一封給送單的人並寄）、withdraw_request()（送單的人收回，只在 new）。
--   5. RLS：送單的人讀自己的；工作區「看」以上讀全部；沒有人直接寫，一律走函式。mail_outbox 多一條讀的政策（request 那幾封給工作區的人看）。
-- ============================================================================

begin;

-- ---------- 1. 表 ----------
create table if not exists public.requests (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('poster', 'post', 'video', 'other')),
  title       text not null,
  purpose     text not null default '',
  needed_by   date,
  brief       text not null default '',
  asset_links text[] not null default '{}',
  contact     text not null default '',
  requester   uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'new' check (status in ('new', 'in_progress', 'done', 'withdrawn')),
  reply       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists requests_requester on public.requests (requester, created_at desc);
create index if not exists requests_status on public.requests (status, created_at desc);
alter table public.requests enable row level security;
revoke all on public.requests from anon, authenticated;
grant select on public.requests to authenticated;

-- ---------- 2. 工作區 ----------
do $$
declare v_owner uuid;
begin
  -- 擁有人：Marketing 的 Director（這一屆有 Director 職位且勾了 Marketing 的人），找不到就一位 Co-President。
  select p.id into v_owner from profiles p
   where p.role = 'cadre' and p.board_role = 'director' and p.team like '%Marketing%' order by p.updated_at limit 1;
  if v_owner is null then
    select id into v_owner from profiles where role = 'cadre' and board_role = 'president' order by updated_at limit 1;
  end if;
  insert into workspaces (id, kind, team, title_zh, title_en, owner)
  values ('custom:marketing-requests', 'custom', 'Marketing Team', '行銷需求單', 'Marketing requests', v_owner)
  on conflict (id) do nothing;
  -- 種人：res:Marketing Team 現在的成員照原等級抄一份（已經在裡面的不動）。
  insert into assignments (user_id, workspace_id, level, granted_by)
  select a.user_id, 'custom:marketing-requests', a.level, a.granted_by
    from assignments a where a.workspace_id = 'res:Marketing Team'
  on conflict (user_id, workspace_id) do nothing;
end $$;

-- ---------- 3. 信的種類 ----------
do $$
declare v text;
begin
  select conname into v from pg_constraint where conrelid = 'public.mail_outbox'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_outbox drop constraint %I', v); end if;
  alter table public.mail_outbox add constraint mail_outbox_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'notice', 'invite', 'request_new', 'request_done'));
  select conname into v from pg_constraint where conrelid = 'public.mail_templates'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%kind%';
  if v is not null then execute format('alter table public.mail_templates drop constraint %I', v); end if;
  alter table public.mail_templates add constraint mail_templates_kind_check
    check (kind in ('guardian', 'interview', 'accepted', 'rejected', 'invite', 'request_new', 'request_done'));
end $$;
alter table public.mail_outbox add column if not exists request_id uuid references public.requests(id) on delete set null;

-- 預設文案，中英各一段。代換符號：{requester} {title} {needed_by} {link} {reply}。信尾由 mail_tail() 自己加。
insert into public.mail_templates (kind, subject, body) values
('request_new',
 'Marketing 需求單：{title}　New request for Marketing: {title}',
 'Marketing 的夥伴你好，' || E'\n\n' ||
 '{requester} 送了一張需求單給 Marketing：「{title}」，希望 {needed_by} 前拿到。' || E'\n' ||
 '內容、素材連結與聯絡方式都在這裡，看完先把狀態改成「進行中」，做完標「做完了」，對方會收到一封信：' || E'\n\n' ||
 '{link}' || E'\n\n' ||
 'Hi Marketing team,' || E'\n\n' ||
 '{requester} sent a request to Marketing: "{title}", needed by {needed_by}.' || E'\n' ||
 'The brief, asset links and contact are here. Set it to "In progress" when you pick it up and "Done" when it ships; the requester gets an email:' || E'\n\n' ||
 '{link}'),
('request_done',
 '你的需求單做完了：{title}　Your request is done: {title}',
 '{requester} 你好，' || E'\n\n' ||
 '你送給 Marketing 的需求單「{title}」做完了。Marketing 的回覆：' || E'\n\n' ||
 '{reply}' || E'\n\n' ||
 '完整內容在這裡：' || E'\n' ||
 '{link}' || E'\n\n' ||
 'Hi {requester},' || E'\n\n' ||
 'Your request to Marketing, "{title}", is done. Their reply:' || E'\n\n' ||
 '{reply}' || E'\n\n' ||
 'Full details:' || E'\n' ||
 '{link}')
on conflict (kind) do nothing;

-- ---------- 4. 代換與排信 ----------
create or replace function public.request_fill(p_text text, p_requester text, p_title text, p_needed_by date, p_link text, p_reply text)
returns text language sql immutable
as $$
  select replace(replace(replace(replace(replace(coalesce(p_text, ''),
           '{requester}', coalesce(p_requester, '')),
           '{title}', coalesce(p_title, '')),
           '{needed_by}', coalesce(to_char(p_needed_by, 'YYYY-MM-DD'), '（沒填）')),
           '{link}', coalesce(p_link, '')),
           '{reply}', coalesce(nullif(btrim(p_reply), ''), '（沒有寫）'))
$$;

-- 送單的人的名字：英文優先（信是中英雙語），沒有就中文。
create or replace function public.request_name(p_uid uuid)
returns text language sql stable
set search_path = public, pg_temp
as $$ select coalesce(nullif(btrim(name_en), ''), nullif(btrim(name_zh), ''), '') from public.profiles where id = p_uid $$;

-- 排一封信進 outbox（內部用，前端叫不動）。p_kind 是 request_new 或 request_done，p_to 是收件人。
create or replace function public.queue_request_mail(p_kind text, p_to text, p_req uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record; v_sub text; v_body text; v_link text; v_id uuid;
begin
  select * into r from requests where id = p_req;
  if r.id is null then raise exception 'no_such_request' using errcode = 'P0001'; end if;
  v_link := 'https://beyondtaiwannpo.com/admin/#' || case when p_kind = 'request_done' then 'request/' else 'requests/' end || r.id::text;
  select subject, body into v_sub, v_body from mail_templates where kind = p_kind;
  if v_sub is null then
    v_sub := case when p_kind = 'request_done' then '你的需求單做完了：{title}' else 'Marketing 需求單：{title}' end;
    v_body := '{requester}：「{title}」' || E'\n\n' || '{link}';
  end if;
  v_sub  := public.request_fill(v_sub,  public.request_name(r.requester), r.title, r.needed_by, v_link, r.reply);
  v_body := public.request_fill(v_body, public.request_name(r.requester), r.title, r.needed_by, v_link, r.reply)
         || public.mail_tail(p_kind);
  insert into mail_outbox (to_email, subject, body, kind, request_id) values (p_to, v_sub, v_body, p_kind, r.id) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.queue_request_mail(text, text, uuid) from public, anon, authenticated;

-- 排完就寄（Paul 2026-10-24 第一題）。Resend 沒設好會丟 mail_not_configured，那不該讓送單失敗：信留在 outbox，總覽那張卡看得到。
create or replace function public.request_try_send()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform public.send_pending_mail(10);
  exception when others then
    null;
  end;
end $$;
revoke all on function public.request_try_send() from public, anon, authenticated;

-- ---------- 5. 三支函式 ----------
-- 幹部送單。回新單的 id。信寄給工作區裡每一個「管」的人（Paul 定的），一人一封。
create or replace function public.submit_request(
  p_kind text, p_title text, p_purpose text, p_needed_by date, p_brief text, p_asset_links text[], p_contact text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_to text; v_n int := 0;
begin
  if not public.is_cadre() then raise exception 'not_cadre' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'empty_title' using errcode = 'P0001'; end if;
  if p_kind not in ('poster', 'post', 'video', 'other') then raise exception 'bad_kind' using errcode = 'P0001'; end if;
  insert into requests (kind, title, purpose, needed_by, brief, asset_links, contact, requester)
  values (p_kind, btrim(p_title), coalesce(p_purpose, ''), p_needed_by, coalesce(p_brief, ''),
          coalesce(p_asset_links, '{}'), coalesce(p_contact, ''), auth.uid())
  returning id into v_id;
  for v_to in
    select distinct u.email from assignments a join auth.users u on u.id = a.user_id
     where a.workspace_id = 'custom:marketing-requests' and a.level = 'manage' and u.email is not null
  loop
    perform public.queue_request_mail('request_new', v_to, v_id); v_n := v_n + 1;
  end loop;
  if v_n > 0 then perform public.request_try_send(); end if;
  return v_id;
end $$;
revoke all on function public.submit_request(text, text, text, date, text, text[], text) from public, anon;
grant execute on function public.submit_request(text, text, text, date, text, text[], text) to authenticated;

-- 「改」以上改狀態、寫回覆。變成 done 就寄一封給送單的人（只在第一次變成 done 時寄）。
create or replace function public.set_request_status(p_id uuid, p_status text, p_reply text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record; v_to text;
begin
  if not public.can_edit('custom:marketing-requests') then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if p_status not in ('new', 'in_progress', 'done') then raise exception 'bad_status' using errcode = 'P0001'; end if;
  select * into r from requests where id = p_id;
  if r.id is null then raise exception 'no_such_request' using errcode = 'P0001'; end if;
  if r.status = 'withdrawn' then raise exception 'withdrawn' using errcode = 'P0001'; end if;
  update requests set status = p_status, reply = coalesce(p_reply, reply), updated_at = now() where id = p_id;
  if p_status = 'done' and r.status <> 'done' then
    select email into v_to from auth.users where id = r.requester;
    if v_to is not null then
      perform public.queue_request_mail('request_done', v_to, p_id);
      perform public.request_try_send();
    end if;
  end if;
  return p_status;
end $$;
revoke all on function public.set_request_status(uuid, text, text) from public, anon;
grant execute on function public.set_request_status(uuid, text, text) to authenticated;

-- 送單的人收回：狀態還是 new 才行（Paul 第三題）。不寄信。
create or replace function public.withdraw_request(p_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  select * into r from requests where id = p_id;
  if r.id is null or r.requester <> auth.uid() then raise exception 'not_yours' using errcode = 'P0001'; end if;
  if r.status <> 'new' then raise exception 'already_started' using errcode = 'P0001'; end if;
  update requests set status = 'withdrawn', updated_at = now() where id = p_id;
  return 'withdrawn';
end $$;
revoke all on function public.withdraw_request(uuid) from public, anon;
grant execute on function public.withdraw_request(uuid) to authenticated;

-- ---------- 6. RLS ----------
drop policy if exists requests_read_own on public.requests;
create policy requests_read_own on public.requests for select to authenticated
  using (requester = auth.uid());
drop policy if exists requests_read_ws on public.requests;
create policy requests_read_ws on public.requests for select to authenticated
  using (public.can_view('custom:marketing-requests'));
-- outbox：request 那幾封，工作區「看」以上讀得到（總覽「還沒寄出的信」才算得到）。
drop policy if exists mail_read_requests on public.mail_outbox;
create policy mail_read_requests on public.mail_outbox for select to authenticated
  using (request_id is not null and public.can_view('custom:marketing-requests'));

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select to_regclass('public.requests') is not null as has_table,
           exists(select 1 from public.workspaces where id = 'custom:marketing-requests' and team = 'Marketing Team' and active) as has_ws,
           (select count(*) from public.mail_templates where kind in ('request_new', 'request_done')) as tpls,
           exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mail_outbox' and column_name = 'request_id') as has_col,
           (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
              and p.proname in ('submit_request', 'set_request_status', 'withdraw_request', 'queue_request_mail')) as fns,
           (select count(*) from pg_policies where schemaname = 'public' and tablename = 'requests') as pols,
           (select count(*) from public.assignments where workspace_id = 'custom:marketing-requests') as members
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when has_table and has_ws and tpls = 2 and has_col and fns = 4 and pols = 2 then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ requests 表在', 'true', has_table::text, case when has_table then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 工作區 custom:marketing-requests 在 Marketing 那一列', 'true', has_ws::text, case when has_ws then 'PASS' else 'FAIL' end from t
  union all select 3, '資訊：從 res:Marketing Team 抄過來的成員數', '（看一眼）', members::text, 'PASS' from t
  union all select 4, '★ 兩封預設文案種好了', '2', tpls::text, case when tpls = 2 then 'PASS' else 'FAIL' end from t
  union all select 5, 'mail_outbox 多了 request_id', 'true', has_col::text, case when has_col then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 四支函式在', '4', fns::text, case when fns = 4 then 'PASS' else 'FAIL' end from t
  union all select 7, '★ requests 兩條讀的政策、沒有寫的政策', '2', pols::text, case when pols = 2 then 'PASS' else 'FAIL' end from t
) x order by ord;
