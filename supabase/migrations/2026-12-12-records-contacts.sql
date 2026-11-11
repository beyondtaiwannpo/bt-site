-- 2026-12-12：一個人的聯絡方式（Paul 2026-11-10：LINE、LinkedIn 都塞在「備註」那一格裡，要有自己的欄位）。
--   1. rc_identities 的 kind 多六種：linkedin、phone、wechat、whatsapp、facebook、website（原本就有 email、line、ig）。
--      跟 email 一樣，同一種同一個值只能屬於一個人（全表唯一索引），撞到代表可能是同一個人，前端會說「別人已經有這個」。
--   2. rc_contact_add(人, 種類, 值)、rc_contact_del(id)：管紀錄的人（rc_can_manage）才能加刪。登入用的 email 不能刪。
--      rc_person 回傳的 identities 多一個 id，前端靠它刪。看得到聯絡方式的人跟以前看得到 email 的人一樣，沒有變大。
--   3. 備註裡已經寫了的聯絡方式（像「LinkedIn: Line: pinwang.0705」）搬進新欄位，備註只留其他的字。
--      搬之前原本的備註整句存進 rc_note_backup（萬一拆錯可以拿回來，前端看不到）。forget_person 連備份一起清。
--      只認這幾個開頭：LINE、LINE ID、LinkedIn、IG、Instagram、Phone、Tel、Mobile、電話、手機、WeChat、微信、WhatsApp、Facebook、FB、Website。
--      值是空的、N/A、無的那一段直接拿掉；值已經屬於別人的那一段留在備註裡，驗收表會列出有幾筆。
-- 可以重跑（備份只存第一次的原文）。最後印一張驗收表。
begin;

alter table public.rc_identities drop constraint if exists rc_identities_kind_check;
alter table public.rc_identities add constraint rc_identities_kind_check
  check (kind in ('email', 'name_zh', 'name_en', 'line', 'ig', 'typed', 'linkedin', 'phone', 'wechat', 'whatsapp', 'facebook', 'website'));

-- 備註搬家前的原文
create table if not exists public.rc_note_backup (
  person_id uuid primary key references public.people(id) on delete cascade,
  note      text not null,
  saved_at  timestamptz not null default now()
);
alter table public.rc_note_backup enable row level security;
revoke all on public.rc_note_backup from public, anon, authenticated;
comment on table public.rc_note_backup is '2026-12-12 把聯絡方式從備註搬出來之前，那個人原本的備註。只給資料庫管理者看，forget_person 會清。';

-- 一個值整理成要存的樣子；不像樣的丟錯
create or replace function public.rc_contact_norm(p_kind text, p_value text)
returns text language plpgsql immutable
set search_path = public, pg_temp
as $$
declare v text := regexp_replace(trim(coalesce(p_value, '')), '\s+', ' ', 'g');
begin
  if p_kind not in ('email', 'line', 'ig', 'linkedin', 'phone', 'wechat', 'whatsapp', 'facebook', 'website') then raise exception 'bad_contact_kind' using errcode = 'P0001'; end if;
  if lower(v) in ('', '-', '--', 'n/a', 'na', 'none', 'nil', 'null', '無', '沒有', 'x') then return null; end if;
  if p_kind = 'email' then
    v := lower(v);
    if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email' using errcode = 'P0001'; end if;
  elsif p_kind = 'ig' then
    v := regexp_replace(v, '^(https?://)?(www\.)?instagram\.com/', '', 'i');
    v := regexp_replace(regexp_replace(v, '^@', ''), '[/?].*$', '');
  elsif p_kind in ('linkedin', 'website', 'facebook') then
    v := regexp_replace(v, '/+$', '');
  end if;
  if length(v) > 200 then raise exception 'too_long' using errcode = 'P0001'; end if;
  return nullif(v, '');
end $$;

create or replace function public.rc_contact_add(p_person uuid, p_kind text, p_value text)
returns bigint language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v text; v_id bigint; v_owner uuid;
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.people where id = p_person and forgotten_at is null) then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  v := public.rc_contact_norm(p_kind, p_value);
  if v is null then raise exception 'need_value' using errcode = 'P0001'; end if;
  select id, person_id into v_id, v_owner from public.rc_identities where kind = p_kind and lower(value) = lower(v);
  if v_id is not null and v_owner <> p_person then raise exception 'contact_taken' using errcode = 'P0001'; end if;
  if v_id is null then
    insert into public.rc_identities (person_id, kind, value, source) values (p_person, p_kind, v, 'admin') returning id into v_id;
    if p_kind = 'email' then update public.people set email = coalesce(email, v) where id = p_person; end if;
    perform public.rc_log_it('contact_add', p_person, null, jsonb_build_object('kind', p_kind, 'value', v));
  end if;
  return v_id;
end $$;

create or replace function public.rc_contact_del(p_id bigint)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r public.rc_identities%rowtype;
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  select * into r from public.rc_identities where id = p_id;
  if not found then return false; end if;
  if r.kind not in ('email', 'line', 'ig', 'linkedin', 'phone', 'wechat', 'whatsapp', 'facebook', 'website') then raise exception 'bad_contact_kind' using errcode = 'P0001'; end if;
  if r.kind = 'email' and (r.verified or exists (select 1 from public.people pe join auth.users u on u.id = pe.profile_id where pe.id = r.person_id and lower(u.email) = lower(r.value))) then
    raise exception 'login_email' using errcode = 'P0001';
  end if;
  delete from public.rc_identities where id = p_id;
  if r.kind = 'email' then update public.people set email = null where id = r.person_id and lower(coalesce(email, '')) = lower(r.value); end if;
  perform public.rc_log_it('contact_delete', r.person_id, jsonb_build_object('kind', r.kind, 'value', r.value), null);
  return true;
end $$;

-- 備註裡的「LINE: xxx」「LinkedIn: Line: xxx」搬進聯絡方式。p_do = false 只算不改。不開放給前端。
create or replace function public.rc_notes_to_contacts(p_do boolean)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  pe record; seg text; s text; m text[]; k text; v_kind text; v text; hit boolean; kept text[]; owner uuid;
  n_people int := 0; n_moved int := 0; n_empty int := 0; n_taken int := 0; n_already int := 0;
  keys constant text := '^(line\s*id|line|linked\s*in|ig|instagram|phone|tel|mobile|電話|手機|wechat|微信|whatsapp|facebook|fb|website)\s*[:：]\s*(.*)$';
begin
  for pe in select id, note from public.people where forgotten_at is null and note ~* '(line|linked\s*in|ig|instagram|phone|tel|mobile|電話|手機|wechat|微信|whatsapp|facebook|fb|website)\s*[:：]' loop
    kept := '{}'; hit := false;
    foreach seg in array regexp_split_to_array(pe.note, '\s*[;；]\s*') loop
      s := trim(seg); k := null;
      loop
        m := regexp_match(s, keys, 'i');
        exit when m is null;
        k := lower(regexp_replace(m[1], '\s+', '', 'g')); s := trim(m[2]);
      end loop;
      if k is null then
        if s <> '' then kept := array_append(kept, s); end if;
        continue;
      end if;
      v_kind := case k when 'lineid' then 'line' when 'line' then 'line' when 'linkedin' then 'linkedin' when 'ig' then 'ig' when 'instagram' then 'ig'
                     when 'wechat' then 'wechat' when '微信' then 'wechat' when 'whatsapp' then 'whatsapp' when 'facebook' then 'facebook' when 'fb' then 'facebook'
                     when 'website' then 'website' else 'phone' end;
      begin v := public.rc_contact_norm(v_kind, s); exception when others then v := s; end;
      hit := true;
      if v is null then n_empty := n_empty + 1; continue; end if;
      select person_id into owner from public.rc_identities where rc_identities.kind = v_kind and lower(value) = lower(v);
      if owner is null then
        n_moved := n_moved + 1;
        if p_do then insert into public.rc_identities (person_id, kind, value, source) values (pe.id, v_kind, v, 'note'); end if;
      elsif owner = pe.id then n_already := n_already + 1;
      else n_taken := n_taken + 1; kept := array_append(kept, trim(seg));
      end if;
    end loop;
    if hit then
      n_people := n_people + 1;
      if p_do then
        insert into public.rc_note_backup (person_id, note) values (pe.id, pe.note) on conflict (person_id) do nothing;
        update public.people set note = nullif(array_to_string(kept, '; '), '') where id = pe.id;
      end if;
    end if;
  end loop;
  return jsonb_build_object('people', n_people, 'moved', n_moved, 'empty', n_empty, 'already', n_already, 'taken', n_taken);
end $$;

-- forget_person 與 delete_my_account 共用的清法，多清備註備份（從 2026-12-10 那版來）
create or replace function public.rc_forget_rows(p_person uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.rc_identities where person_id = p_person;
  delete from public.rc_schools where person_id = p_person;
  delete from public.rc_note_backup where person_id = p_person;
  delete from public.rc_participation where person_id = p_person;
  delete from public.rc_outcomes where person_id = p_person;
  update public.rc_responses set person_id = null, participation_id = null, typed_name = '', contact_ok = false where person_id = p_person;
  update public.rc_pairs set mentor_id = null where mentor_id = p_person;
  update public.rc_pairs set mentee_id = null where mentee_id = p_person;
  delete from public.positions where person_id = p_person;
  update public.invite_codes set person_id = null where person_id = p_person;
  update public.people set name_zh = null, name_en = null, email = null, note = null, school = null, grad_year = null, forgotten_at = now() where id = p_person;
end $$;

-- 一個人的頁面（從 2026-12-10 那版來，identities 多 id，前端刪聯絡方式用；管的人多看到登入用的 email）
create or replace function public.rc_person(p_person uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare pe public.people%rowtype;
begin
  if not public.rc_can_view() then raise exception 'not_records_viewer' using errcode = 'P0001'; end if;
  select * into pe from public.people where id = p_person;
  if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'person', jsonb_build_object('id', pe.id, 'name', public.rc_person_name(pe.id), 'name_zh', pe.name_zh, 'name_en', pe.name_en, 'kind', pe.kind, 'school', pe.school,
                                 'grad_year', pe.grad_year, 'note', pe.note, 'has_account', pe.profile_id is not null, 'forgotten_at', pe.forgotten_at,
                                 'role', (select role from public.profiles where id = pe.profile_id),
                                 'login_email', case when public.rc_can_manage() then (select lower(u.email) from auth.users u where u.id = pe.profile_id) end),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'school', s.school, 'year_from', s.year_from, 'year_to', s.year_to, 'source', s.source, 'note', s.note,
                                 'current', lower(trim(s.school)) = lower(trim(coalesce(pe.school, ''))))
                                 order by s.year_from nulls last, s.recorded_at) from public.rc_schools s where s.person_id = pe.id), '[]'::jsonb),
    'aliases', coalesce((select jsonb_agg(i.value order by i.kind, i.value) from public.rc_identities i where i.person_id = pe.id and i.kind in ('name_en', 'name_zh')
                           and lower(i.value) not in (lower(coalesce(pe.name_en, '')), lower(coalesce(pe.name_zh, '')))), '[]'::jsonb),
    'identities', case when public.rc_can_manage() then coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'value', i.value, 'source', i.source, 'verified', i.verified) order by i.kind, i.value) from public.rc_identities i where i.person_id = pe.id), '[]'::jsonb) else '[]'::jsonb end,
    'positions', coalesce((select jsonb_agg(jsonb_build_object('term', po.term_id, 'title_zh', po.title_zh, 'title_en', po.title_en, 'team', po.team) order by po.term_id desc) from public.positions po where po.person_id = pe.id), '[]'::jsonb),
    'participation', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'event_id', e.id, 'event', coalesce(nullif(e.title_zh, ''), e.title_en), 'kind', e.kind, 'term_id', e.term_id, 'starts_at', e.starts_at, 'role', x.role, 'status', x.status)
                                  order by e.starts_at desc nulls last) from public.rc_participation x join public.events e on e.id = x.event_id where x.person_id = pe.id), '[]'::jsonb),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'event_id', pr.event_id, 'event', (select coalesce(nullif(e.title_zh, ''), e.title_en) from public.events e where e.id = pr.event_id),
                                 'as', case when pr.mentor_id = pe.id then 'mentor' else 'mentee' end,
                                 'with', public.rc_person_name(case when pr.mentor_id = pe.id then pr.mentee_id else pr.mentor_id end),
                                 'with_id', case when pr.mentor_id = pe.id then pr.mentee_id else pr.mentor_id end,
                                 'matched_on', pr.matched_on, 'ended_on', pr.ended_on, 'end_reason', pr.end_reason) order by pr.matched_on desc nulls last)
                         from public.rc_pairs pr where pr.mentor_id = pe.id or pr.mentee_id = pe.id), '[]'::jsonb),
    'outcomes', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'institution', o.institution, 'country', o.country, 'major', o.major, 'year', o.year, 'note', o.note,
                                 'source', o.source, 'visibility', o.visibility, 'recorded_at', o.recorded_at) order by o.year desc nulls last, o.recorded_at desc)
                           from public.rc_outcomes o where o.person_id = pe.id and (o.visibility <> 'private' or public.rc_can_manage())), '[]'::jsonb),
    'responses', coalesce((select jsonb_agg(jsonb_build_object('form_id', f.id, 'title', f.title, 'kind', f.kind, 'submitted_at', r.submitted_at,
                                 'answers', (select jsonb_agg(jsonb_build_object('key', q.key, 'label', q.label, 'value', a.value) order by q.ord) from public.rc_answers a join public.rc_questions q on q.id = a.question_id where a.response_id = r.id))
                                 order by r.submitted_at desc)
                            from public.rc_responses r join public.rc_forms f on f.id = r.form_id where r.person_id = pe.id and not f.anonymous and public.rc_form_reader(f.id)), '[]'::jsonb));
end $$;

revoke all on function public.rc_contact_norm(text, text), public.rc_notes_to_contacts(boolean), public.rc_forget_rows(uuid) from public, anon, authenticated;
revoke all on function public.rc_contact_add(uuid, text, text), public.rc_contact_del(bigint) from public, anon;
grant execute on function public.rc_contact_add(uuid, text, text), public.rc_contact_del(bigint) to authenticated;

-- 現在就搬一次。結果留在暫存表給下面的驗收表印。
create temp table rc_notes_moved on commit drop as select public.rc_notes_to_contacts(true) as r;
create temp table rc_notes_result as select r from rc_notes_moved;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  res as (select r from rc_notes_result),
  t as (
    select (select pg_get_constraintdef(oid) like '%linkedin%' and pg_get_constraintdef(oid) like '%whatsapp%' from pg_constraint where conname = 'rc_identities_kind_check') as kinds_ok,
           (select body like '%rc_can_manage()%' and body like '%contact_taken%' from fn where proname = 'rc_contact_add')
             and (select body like '%rc_can_manage()%' and body like '%login_email%' from fn where proname = 'rc_contact_del') as rpc_ok,
           (select has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute') from pg_proc p where p.proname = 'rc_contact_add' and p.pronamespace = 'public'::regnamespace)
             and (select not has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p where p.proname = 'rc_notes_to_contacts' and p.pronamespace = 'public'::regnamespace) as grants_ok,
           (select body like '%rc_note_backup%' from fn where proname = 'rc_forget_rows') as forget_ok,
           (select not has_table_privilege('authenticated', 'public.rc_note_backup', 'select') and not has_table_privilege('anon', 'public.rc_note_backup', 'select')) as backup_private,
           (select body like '%''id'', i.id%' and body like '%''login_email'', case when public.rc_can_manage()%' from fn where proname = 'rc_person') as person_ok,
           (select (r->>'people')::int from res) as n_people, (select (r->>'moved')::int from res) as n_moved,
           (select (r->>'empty')::int from res) as n_empty, (select (r->>'taken')::int from res) as n_taken
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when kinds_ok and rpc_ok and grants_ok and forget_ok and backup_private and person_ok then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '聯絡方式多六種（LinkedIn、電話、WeChat、WhatsApp、Facebook、網站）', 'true', kinds_ok::text, case when kinds_ok then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 加刪聯絡方式只有管紀錄的人；登入用的 email 刪不掉', 'true', rpc_ok::text, case when rpc_ok then 'PASS' else 'FAIL' end from t
  union all select 3, '登入的人叫得到加刪、anon 不行；搬備註那支前端叫不到', 'true', grants_ok::text, case when grants_ok then 'PASS' else 'FAIL' end from t
  union all select 4, '★ forget_person 連備註備份一起清', 'true', forget_ok::text, case when forget_ok then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 備註備份前端讀不到', 'true', backup_private::text, case when backup_private then 'PASS' else 'FAIL' end from t
  union all select 6, '一個人的頁面帶聯絡方式的 id、只給管的人', 'true', person_ok::text, case when person_ok then 'PASS' else 'FAIL' end from t
  union all select 7, '備註有聯絡方式的人數（資訊）', '-', n_people::text, 'INFO' from t
  union all select 8, '搬進聯絡方式的筆數（資訊）', '-', n_moved::text, 'INFO' from t
  union all select 9, '值是空的、直接從備註拿掉的段數（資訊）', '-', n_empty::text, 'INFO' from t
  union all select 10, '值已經屬於別人、留在備註裡的段數（資訊，可能是重複的人）', '-', n_taken::text, 'INFO' from t
) x order by ord;
