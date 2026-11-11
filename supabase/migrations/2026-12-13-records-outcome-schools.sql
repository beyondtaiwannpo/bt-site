-- 2026-12-13：去向是一所學校，就自動進那個人的「讀過的學校」（Paul 2026-11-10）。
--   只算真的去讀的三種：enrolled（就讀中）、transferred（轉學）、graduated（畢業）。applied（申請了）、admitted（錄取）不算，
--   那些是錄取通知，一個人可能錄取五間只去一間。
--   年份：就讀中、轉學的那一年填「從」，畢業那一年填「到」；學校紀錄上已經有年份的不蓋掉。
--   不改 people.school（「現在的學校」還是人自己決定）。刪掉去向不會刪學校紀錄，學校紀錄是歷史，要刪到那一列按刪除。
--   rc_schools.source 多一種 'outcome'。現有的去向一次補進去。
-- 可以重跑。最後印一張驗收表。
begin;

alter table public.rc_schools drop constraint if exists rc_schools_source_check;
alter table public.rc_schools add constraint rc_schools_source_check check (source in ('admin', 'merge', 'backfill', 'auto', 'import', 'outcome'));

create or replace function public.rc_outcome_school(p_person uuid, p_kind text, p_school text, p_year int)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_year smallint := case when p_year between 2000 and 2100 then p_year::smallint end;
begin
  if p_person is null or p_kind not in ('enrolled', 'transferred', 'graduated') or nullif(trim(coalesce(p_school, '')), '') is null then return; end if;
  if exists (select 1 from public.people where id = p_person and forgotten_at is not null) then return; end if;
  select id into v_id from public.rc_schools where person_id = p_person and lower(trim(school)) = lower(trim(p_school));
  if v_id is null then
    insert into public.rc_schools (person_id, school, year_from, year_to, source)
    values (p_person, trim(p_school), case when p_kind <> 'graduated' then v_year end, case when p_kind = 'graduated' then v_year end, 'outcome');
  elsif v_year is not null then
    update public.rc_schools set year_from = case when p_kind <> 'graduated' then coalesce(year_from, v_year) else year_from end,
                                 year_to   = case when p_kind = 'graduated' then coalesce(year_to, v_year) else year_to end
     where id = v_id and (year_to is null or p_kind = 'graduated' or v_year <= year_to) and (year_from is null or p_kind <> 'graduated' or v_year >= year_from);
  end if;
end $$;

create or replace function public.rc_outcomes_school_trg()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.rc_outcome_school(new.person_id, new.kind, new.institution, new.year);
  return new;
end $$;
drop trigger if exists rc_outcomes_school on public.rc_outcomes;
create trigger rc_outcomes_school after insert or update of kind, institution, year on public.rc_outcomes
  for each row execute function public.rc_outcomes_school_trg();

revoke all on function public.rc_outcome_school(uuid, text, text, int), public.rc_outcomes_school_trg() from public, anon, authenticated;

-- 現有的去向補一次（舊的先、新的後，畢業年份蓋在就讀年份之後）
create temp table rc_os_before on commit drop as select count(*) n from public.rc_schools;
select public.rc_outcome_school(o.person_id, o.kind, o.institution, o.year)
  from public.rc_outcomes o order by o.year nulls first, o.recorded_at;
create temp table rc_os_added as select (select count(*) from public.rc_schools) - (select n from rc_os_before) as n;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select (select pg_get_constraintdef(oid) like '%outcome%' from pg_constraint where conname = 'rc_schools_source_check') as src_ok,
           (select count(*) = 1 from pg_trigger where tgname = 'rc_outcomes_school' and not tgisinternal) as trg_ok,
           (select body like '%''enrolled'', ''transferred'', ''graduated''%' from fn where proname = 'rc_outcome_school') as kinds_ok,
           (select not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute') from pg_proc p where p.proname = 'rc_outcome_school' and p.pronamespace = 'public'::regnamespace) as private_ok,
           (select count(*) from public.rc_outcomes o where o.kind in ('enrolled', 'transferred', 'graduated') and trim(o.institution) <> ''
               and not exists (select 1 from public.rc_schools s where s.person_id = o.person_id and lower(trim(s.school)) = lower(trim(o.institution)))
               and not exists (select 1 from public.people pe where pe.id = o.person_id and pe.forgotten_at is not null)) as missing,
           (select n from rc_os_added) as added
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when src_ok and trg_ok and kinds_ok and private_ok and missing = 0 then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '學校紀錄的來源多「去向」', 'true', src_ok::text, case when src_ok then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 去向一存就補學校紀錄（trigger）', 'true', trg_ok::text, case when trg_ok then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 只算就讀中、轉學、畢業（申請了、錄取不算）', 'true', kinds_ok::text, case when kinds_ok then 'PASS' else 'FAIL' end from t
  union all select 4, '補學校那支前端叫不到', 'true', private_ok::text, case when private_ok then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 是學校的去向都已經在學校紀錄上', '0', missing::text, case when missing = 0 then 'PASS' else 'FAIL' end from t
  union all select 6, '這次補進去的學校（資訊）', '-', added::text, 'INFO' from t
) x order by ord;
