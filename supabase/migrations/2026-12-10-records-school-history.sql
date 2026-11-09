-- 2026-12-10：一個人讀過的學校有紀錄了（Paul 2026-11-09：「她先讀北一女、第二年轉去 UWC Costa Rica，我要怎麼記？」）。
-- 之前 people.school 只有一格，合併兩列時只留一邊的學校，另一邊的學校、英文名就不見了。
--   1. 新表 rc_schools：一個人一列一所學校，哪一年到哪一年（可以空著）、來源（admin 人填、merge 合併帶進來、backfill 從舊欄位補、auto 改欄位時自動、import）。
--      people.school 還在，意思變成「現在或最後的學校」，名錄篩選與對外統計照舊用它。
--   2. 先把每個人現在的 people.school 補成一列（backfill），之後 people.school 一改（任何路徑：編輯、合併、學生自己填）trigger 自動補一列，不會漏。
--   3. rc_merge_people：被併那列的學校進學校紀錄、英文名／中文名不同的進 rc_identities 當別名（找人用 email 或名字片段都找得到）。
--   4. rc_person 多 schools、aliases；rc_directory 多 schools、aliases（名錄用學校篩會連舊學校一起算）；rc_dup_side 多 schools。
--   5. rc_save_school／rc_delete_school／rc_set_current_school 給管紀錄的人在一個人的頁面上改。
--   6. rc_forget_rows 連學校紀錄一起刪（forget_person 與 delete_my_account 都走它）。
-- 可以重跑。最後印一張驗收表。
begin;

create table if not exists public.rc_schools (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete cascade,
  school      text not null check (trim(school) <> ''),
  year_from   smallint check (year_from is null or year_from between 2000 and 2100),
  year_to     smallint check (year_to is null or year_to between 2000 and 2100),
  source      text not null default 'admin' check (source in ('admin', 'merge', 'backfill', 'auto', 'import')),
  note        text not null default '',
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index if not exists rc_schools_person on public.rc_schools (person_id, year_from);
comment on table public.rc_schools is '一個人讀過的學校，一列一所（2026-12-10）。people.school 是「現在或最後的」那一所，這裡是全部。';
alter table public.rc_schools enable row level security;
revoke all on public.rc_schools from public, anon, authenticated;

-- 同一個人同一所學校（忽略大小寫與前後空白）只記一列
create or replace function public.rc_school_add(p_person uuid, p_school text, p_source text)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_person is null or nullif(trim(coalesce(p_school, '')), '') is null then return false; end if;
  if exists (select 1 from public.rc_schools s where s.person_id = p_person and lower(trim(s.school)) = lower(trim(p_school))) then return false; end if;
  insert into public.rc_schools (person_id, school, source) values (p_person, trim(p_school), coalesce(p_source, 'auto'));
  return true;
end $$;
revoke all on function public.rc_school_add(uuid, text, text) from public, anon, authenticated;

-- 補舊資料：現在有學校的人每人一列
insert into public.rc_schools (person_id, school, source)
select pe.id, trim(pe.school), 'backfill' from public.people pe
 where nullif(trim(coalesce(pe.school, '')), '') is not null and pe.forgotten_at is null
   and not exists (select 1 from public.rc_schools s where s.person_id = pe.id and lower(trim(s.school)) = lower(trim(pe.school)));

-- people.school 一改就補一列
create or replace function public.rc_people_school_trg()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.forgotten_at is null then perform public.rc_school_add(new.id, new.school, 'auto'); end if;
  return new;
end $$;
drop trigger if exists rc_people_school on public.people;
create trigger rc_people_school after insert or update of school on public.people
  for each row execute function public.rc_people_school_trg();

-- 管紀錄的人在一個人的頁面上加、改、刪一所學校；make_current 把它寫回 people.school
create or replace function public.rc_save_school(p_school uuid, p jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_person uuid;
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if nullif(p->>'year_from', '') is not null and nullif(p->>'year_to', '') is not null and (p->>'year_from')::int > (p->>'year_to')::int then raise exception 'years_backwards' using errcode = 'P0001'; end if;
  if p_school is null then
    v_person := (p->>'person_id')::uuid;
    if not exists (select 1 from public.people where id = v_person and forgotten_at is null) then raise exception 'no_such_person' using errcode = 'P0001'; end if;
    if nullif(trim(coalesce(p->>'school', '')), '') is null then raise exception 'need_school' using errcode = 'P0001'; end if;
    select id into v_id from public.rc_schools where person_id = v_person and lower(trim(school)) = lower(trim(p->>'school'));
    if v_id is null then
      insert into public.rc_schools (person_id, school, year_from, year_to, note, source, recorded_by)
      values (v_person, trim(p->>'school'), nullif(p->>'year_from', '')::smallint, nullif(p->>'year_to', '')::smallint, coalesce(p->>'note', ''), 'admin', auth.uid()) returning id into v_id;
    else
      update public.rc_schools set year_from = coalesce(nullif(p->>'year_from', '')::smallint, year_from), year_to = coalesce(nullif(p->>'year_to', '')::smallint, year_to),
             note = case when p ? 'note' then coalesce(p->>'note', '') else note end where id = v_id;
    end if;
  else
    select id, person_id into v_id, v_person from public.rc_schools where id = p_school;
    if v_id is null then raise exception 'no_such_school' using errcode = 'P0001'; end if;
    update public.rc_schools set school = coalesce(nullif(trim(p->>'school'), ''), school),
           year_from = case when p ? 'year_from' then nullif(p->>'year_from', '')::smallint else year_from end,
           year_to = case when p ? 'year_to' then nullif(p->>'year_to', '')::smallint else year_to end,
           note = case when p ? 'note' then coalesce(p->>'note', '') else note end
     where id = v_id;
  end if;
  if coalesce((p->>'make_current')::boolean, false) then
    update public.people set school = (select school from public.rc_schools where id = v_id) where id = v_person;
  end if;
  perform public.rc_log_it('school_save', v_person, null, p);
  return v_id;
end $$;

create or replace function public.rc_delete_school(p_school uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_person uuid; v_school text;
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  select person_id, school into v_person, v_school from public.rc_schools where id = p_school;
  if v_person is null then return false; end if;
  delete from public.rc_schools where id = p_school;
  -- 刪的是現在那一所，people.school 也清掉，不然 trigger 下次又補回來
  update public.people set school = null where id = v_person and lower(trim(coalesce(school, ''))) = lower(trim(v_school));
  perform public.rc_log_it('school_delete', v_person, to_jsonb(v_school), null);
  return true;
end $$;

create or replace function public.rc_set_current_school(p_school uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_person uuid; v_school text;
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  select person_id, school into v_person, v_school from public.rc_schools where id = p_school;
  if v_person is null then raise exception 'no_such_school' using errcode = 'P0001'; end if;
  update public.people set school = v_school where id = v_person;
  return true;
end $$;
revoke all on function public.rc_save_school(uuid, jsonb), public.rc_delete_school(uuid), public.rc_set_current_school(uuid), public.rc_people_school_trg() from public, anon;
grant execute on function public.rc_save_school(uuid, jsonb), public.rc_delete_school(uuid), public.rc_set_current_school(uuid) to authenticated;

-- 合併（從 2026-12-08 那版來，多了學校與別名那一段）
create or replace function public.rc_merge_people(p_keep uuid, p_drop uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_keep public.people%rowtype; v_drop public.people%rowtype;
begin
  if not public.rc_can_manage() then raise exception 'not_records_manager' using errcode = 'P0001'; end if;
  if p_keep = p_drop then raise exception 'same_person' using errcode = 'P0001'; end if;
  select * into v_keep from public.people where id = p_keep; if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  select * into v_drop from public.people where id = p_drop; if not found then raise exception 'no_such_person' using errcode = 'P0001'; end if;
  if v_keep.profile_id is not null and v_drop.profile_id is not null then raise exception 'both_have_accounts' using errcode = 'P0001'; end if;
  update public.rc_identities set person_id = p_keep where person_id = p_drop
     and not exists (select 1 from public.rc_identities k where k.person_id = p_keep and k.kind = rc_identities.kind and lower(k.value) = lower(rc_identities.value));
  delete from public.rc_identities where person_id = p_drop;
  update public.rc_participation set person_id = p_keep where person_id = p_drop
     and not exists (select 1 from public.rc_participation k where k.person_id = p_keep and k.event_id = rc_participation.event_id and k.role = rc_participation.role
                        and coalesce(k.session_id, '00000000-0000-0000-0000-000000000000') = coalesce(rc_participation.session_id, '00000000-0000-0000-0000-000000000000'));
  delete from public.rc_participation where person_id = p_drop;
  update public.rc_responses set person_id = p_keep where person_id = p_drop;
  update public.rc_pairs set mentor_id = p_keep where mentor_id = p_drop;
  update public.rc_pairs set mentee_id = p_keep where mentee_id = p_drop;
  update public.rc_outcomes set person_id = p_keep where person_id = p_drop;
  update public.people set name_zh = coalesce(name_zh, v_drop.name_zh), name_en = coalesce(name_en, v_drop.name_en),
         school = coalesce(school, v_drop.school), grad_year = coalesce(grad_year, v_drop.grad_year), email = coalesce(email, v_drop.email),
         kind = case when kind = 'member' or v_drop.kind = 'member' then 'member' else kind end,
         -- 備註接在一起：留的在前、併進來的在後，一樣的（忽略前後空白）只留一份
         note = case when nullif(trim(coalesce(v_drop.note, '')), '') is null then note
                     when nullif(trim(coalesce(note, '')), '') is null then trim(v_drop.note)
                     when trim(note) = trim(v_drop.note) then note
                     else trim(note) || ' / ' || trim(v_drop.note) end
   where id = p_keep;
  -- 2026-12-10：被併那列的學校、英文名、中文名不丟。學校進學校紀錄（來源 merge），名字不同的進 rc_identities 當別名（找人找得到）。
  update public.rc_schools set person_id = p_keep, source = 'merge' where person_id = p_drop
     and not exists (select 1 from public.rc_schools k where k.person_id = p_keep and lower(trim(k.school)) = lower(trim(rc_schools.school)));
  delete from public.rc_schools where person_id = p_drop;
  if nullif(trim(coalesce(v_drop.school, '')), '') is not null then perform public.rc_school_add(p_keep, v_drop.school, 'merge'); end if;
  if nullif(trim(coalesce(v_drop.name_en, '')), '') is not null and lower(trim(v_drop.name_en)) <> lower(trim(coalesce(v_keep.name_en, ''))) then
    insert into public.rc_identities (person_id, kind, value, source) select p_keep, 'name_en', trim(v_drop.name_en), 'merge'
     where not exists (select 1 from public.rc_identities i where i.person_id = p_keep and i.kind = 'name_en' and lower(i.value) = lower(trim(v_drop.name_en)));
  end if;
  if nullif(trim(coalesce(v_drop.name_zh, '')), '') is not null and trim(v_drop.name_zh) <> trim(coalesce(v_keep.name_zh, '')) then
    insert into public.rc_identities (person_id, kind, value, source) select p_keep, 'name_zh', trim(v_drop.name_zh), 'merge'
     where not exists (select 1 from public.rc_identities i where i.person_id = p_keep and i.kind = 'name_zh' and i.value = trim(v_drop.name_zh));
  end if;
  if v_drop.kind = 'member' or v_drop.profile_id is not null or exists (select 1 from public.positions where person_id = p_drop) then
    if not public.is_president() then raise exception 'not_president' using errcode = 'P0001'; end if;
    perform public.merge_people(p_keep, p_drop);
  else
    delete from public.people where id = p_drop;
  end if;
  perform public.rc_log_it('person_merge', p_keep, to_jsonb(p_drop), null);
  return p_keep;
end $$;

-- 一個人的頁面（從 2026-12-01 那版來，多 schools 與 aliases）
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
                                 'role', (select role from public.profiles where id = pe.profile_id)),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'school', s.school, 'year_from', s.year_from, 'year_to', s.year_to, 'source', s.source, 'note', s.note,
                                 'current', lower(trim(s.school)) = lower(trim(coalesce(pe.school, ''))))
                                 order by s.year_from nulls last, s.recorded_at) from public.rc_schools s where s.person_id = pe.id), '[]'::jsonb),
    'aliases', coalesce((select jsonb_agg(i.value order by i.kind, i.value) from public.rc_identities i where i.person_id = pe.id and i.kind in ('name_en', 'name_zh')
                           and lower(i.value) not in (lower(coalesce(pe.name_en, '')), lower(coalesce(pe.name_zh, '')))), '[]'::jsonb),
    'identities', case when public.rc_can_manage() then coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'value', i.value, 'source', i.source, 'verified', i.verified) order by i.kind, i.value) from public.rc_identities i where i.person_id = pe.id), '[]'::jsonb) else '[]'::jsonb end,
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

-- 名錄（從 2026-12-03 那版來，多 schools 與 aliases）
create or replace function public.rc_directory()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select case when public.rc_can_view() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', pe.id,
             'name', public.rc_person_name(pe.id),
             'name_zh', coalesce(pr.name_zh, pe.name_zh),
             'name_en', coalesce(pr.name_en, pe.name_en),
             'kind', pe.kind,
             'role', pr.role,
             'team', pr.team,
             'school', pe.school,
             'grad_year', pe.grad_year,
             'schools', coalesce((select jsonb_agg(distinct s.school) from public.rc_schools s where s.person_id = pe.id), '[]'::jsonb),
             'aliases', coalesce((select jsonb_agg(distinct i.value) from public.rc_identities i where i.person_id = pe.id and i.kind in ('name_en', 'name_zh')
                           and lower(i.value) not in (lower(coalesce(pr.name_en, pe.name_en, '')), lower(coalesce(pr.name_zh, pe.name_zh, '')))), '[]'::jsonb),
             'has_account', pe.profile_id is not null,
             'terms', coalesce((select jsonb_agg(distinct t) from (
                        select e.term_id as t from public.rc_participation x join public.events e on e.id = x.event_id where x.person_id = pe.id and e.term_id is not null
                        union select po.term_id from public.positions po where po.person_id = pe.id) z), '[]'::jsonb),
             'events', coalesce((select jsonb_agg(distinct x.event_id) from public.rc_participation x where x.person_id = pe.id), '[]'::jsonb),
             'roles', coalesce((select jsonb_agg(distinct x.role) from public.rc_participation x where x.person_id = pe.id), '[]'::jsonb),
             'countries', coalesce((select jsonb_agg(distinct o.country) from public.rc_outcomes o where o.person_id = pe.id and o.country <> '' and (o.visibility <> 'private' or public.rc_can_manage())), '[]'::jsonb),
             'latest', (select o.institution from public.rc_outcomes o where o.person_id = pe.id and (o.visibility <> 'private' or public.rc_can_manage()) order by o.year desc nulls last, o.recorded_at desc limit 1),
             'n', (select count(*) from public.rc_participation x where x.person_id = pe.id)
           ) order by public.rc_person_name(pe.id))
      from public.people pe left join public.profiles pr on pr.id = pe.profile_id
     where pe.forgotten_at is null), '[]'::jsonb) else '[]'::jsonb end;
$$;

-- 可能重複那張卡的一欄（從 2026-12-09 那版來，多 schools）
create or replace function public.rc_dup_side(p_person uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', pe.id, 'name', public.rc_person_name(pe.id), 'name_zh', coalesce(pr.name_zh, pe.name_zh), 'name_en', coalesce(pr.name_en, pe.name_en),
    'kind', pe.kind, 'school', pe.school, 'grad_year', pe.grad_year, 'has_account', pe.profile_id is not null, 'role', pr.role, 'team', pr.team, 'note', pe.note,
    'created_at', pe.created_at,
    'emails', to_jsonb(public.rc_emails(pe.id)),
    'schools', coalesce((select jsonb_agg(s.school order by s.year_from nulls last, s.recorded_at) from public.rc_schools s where s.person_id = pe.id), '[]'::jsonb),
    'n_events', (select count(*) from public.rc_participation x where x.person_id = pe.id),
    'events', coalesce((select jsonb_agg(jsonb_build_object('title', coalesce(e.title_en, e.title_zh, e.slug), 'year', extract(year from e.starts_at)::int, 'role', x.role, 'status', x.status) order by e.starts_at desc nulls last)
                       from (select * from public.rc_participation x where x.person_id = pe.id order by recorded_at desc limit 6) x join public.events e on e.id = x.event_id), '[]'::jsonb),
    'n_pairs', (select count(*) from public.rc_pairs r where r.mentor_id = pe.id or r.mentee_id = pe.id),
    'n_outcomes', (select count(*) from public.rc_outcomes o where o.person_id = pe.id),
    'n_emails', cardinality(public.rc_emails(pe.id)),
    'n_answers', (select count(*) from public.rc_responses r where r.person_id = pe.id),
    'score', (pe.profile_id is not null)::int * 1000 + (select count(*) from public.rc_participation x where x.person_id = pe.id) * 10
             + (pe.name_zh is not null)::int + (pe.name_en is not null)::int + (pe.school is not null)::int + (pe.grad_year is not null)::int
             + (select count(*) from public.rc_identities i where i.person_id = pe.id))
    from public.people pe left join public.profiles pr on pr.id = pe.profile_id where pe.id = p_person;
$$;

-- 忘記一個人（從 2026-12-02 那版來，多刪 rc_schools）
create or replace function public.rc_forget_rows(p_person uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.rc_identities where person_id = p_person;
  delete from public.rc_schools where person_id = p_person;
  delete from public.rc_participation where person_id = p_person;
  delete from public.rc_outcomes where person_id = p_person;
  update public.rc_responses set person_id = null, participation_id = null, typed_name = '', contact_ok = false where person_id = p_person;
  update public.rc_pairs set mentor_id = null where mentor_id = p_person;
  update public.rc_pairs set mentee_id = null where mentee_id = p_person;
  delete from public.positions where person_id = p_person;
  update public.invite_codes set person_id = null where person_id = p_person;
  update public.people set name_zh = null, name_en = null, email = null, note = null, school = null, grad_year = null, forgotten_at = now() where id = p_person;
end $$;

revoke all on function public.rc_dup_side(uuid) from public, anon, authenticated;
revoke all on function public.rc_forget_rows(uuid) from public, anon, authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'rc_schools') = 1 as table_ok,
           (select count(*) from pg_trigger where tgname = 'rc_people_school' and tgrelid = 'public.people'::regclass) = 1 as trigger_ok,
           (select count(*) from public.people pe where nullif(trim(coalesce(pe.school, '')), '') is not null and pe.forgotten_at is null
               and not exists (select 1 from public.rc_schools s where s.person_id = pe.id and lower(trim(s.school)) = lower(trim(pe.school)))) = 0 as backfill_ok,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%rc_school_add(p_keep, v_drop.school%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%''name_en'', trim(v_drop.name_en)%' from pg_proc where proname = 'rc_merge_people' and pronamespace = 'public'::regnamespace) as merge_ok,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%delete from public.rc_schools where person_id = p_person%' from pg_proc where proname = 'rc_forget_rows' and pronamespace = 'public'::regnamespace) as forget_ok,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%''schools''%' and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%''aliases''%' from pg_proc where proname = 'rc_person' and pronamespace = 'public'::regnamespace)
             and (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%''schools''%' from pg_proc where proname = 'rc_directory' and pronamespace = 'public'::regnamespace) as read_ok,
           (select not has_table_privilege('authenticated', 'public.rc_schools', 'select') and not has_table_privilege('anon', 'public.rc_schools', 'select')) as table_locked,
           (select bool_and(has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')) from pg_proc p where p.proname in ('rc_save_school', 'rc_delete_school', 'rc_set_current_school') and p.pronamespace = 'public'::regnamespace) as grants_ok
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when table_ok and trigger_ok and backfill_ok and merge_ok and forget_ok and read_ok and table_locked and grants_ok then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, 'rc_schools 表在', 'true', table_ok::text, case when table_ok then 'PASS' else 'FAIL' end from t
  union all select 2, 'people.school 一改就補一列的 trigger 在', 'true', trigger_ok::text, case when trigger_ok then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 現在有學校的人每人都有一列', 'true', backfill_ok::text, case when backfill_ok then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 合併把被併那列的學校與英文名留下來', 'true', merge_ok::text, case when merge_ok then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 忘記一個人連學校紀錄一起刪', 'true', forget_ok::text, case when forget_ok then 'PASS' else 'FAIL' end from t
  union all select 6, '一個人的頁面與名錄帶 schools、aliases', 'true', read_ok::text, case when read_ok then 'PASS' else 'FAIL' end from t
  union all select 7, '表只給函式讀寫，前端直接讀不到', 'true', table_locked::text, case when table_locked then 'PASS' else 'FAIL' end from t
  union all select 8, '三支改學校的函式登入的人叫得到、anon 不行', 'true', grants_ok::text, case when grants_ok then 'PASS' else 'FAIL' end from t
) x order by ord;
