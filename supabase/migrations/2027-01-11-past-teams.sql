-- 前幾屆的團隊（頂欄「團隊」底下的 2025-26、2024-25 那兩頁）　2026-11-25
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 要先跑過 2026-10-24-ranks-and-workspaces.sql（terms、people、positions、is_president、require_senior）
-- 與 2026-12-01-records.sql（people.kind、people.forgotten_at）。
--
-- Paul 2026-11-25：「we're adding alumni into Teams. So once you press the menu on the upper menu of Teams, there should be a drop down
-- that has current team, 2025 to 2026 alumni, 2024 to 2025 alumni」。
-- 同一天問他那兩頁上要出現誰，三個選項（本人同意的、整份名單只放名字、Co-President 一個一個勾），他選「Whole roster, names only」。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   對外多一份「已經結束的那幾屆有誰」：名字、team、那一屆的職位。**沒有照片、沒有 email、沒有任何 id。**
--   跟這一屆的名單（public_team()）是兩件事：這一屆要本人同意加 Co-President 核可；前幾屆照 Paul 的決定是整份名單。
--   整份名單沒有每個人自己的同意，所以多兩道門，兩道都只有 Co-President 動得了：
--
--   1. 一屆一個開關（terms.past_public，預設關）。**這一支跑完，對外一個名字都不會多**：
--      Co-President 在後台看過那一屆的名單、把不該出現的人藏起來之後，自己把那一屆打開。誰開的、什麼時候開的記在同一列。
--   2. 一個人一個「不要出現」（past_team_hidden 表）。藏起來的人每一屆都不出現。
--      **未滿 18 歲的人一律要藏**（這個 repo 的紅線：未成年不對外）。資料庫不知道誰幾歲，這件事只能靠人看，
--      所以後台那一頁把每個人的學校與畢業年印在名字旁邊，開關上面有一句提醒。
--
--   另外四種人不用藏、本來就不會出現：學員與來賓（people.kind 不是 member）、本人要求移除的（forgotten_at）、
--   兩個名字都是空的、那一屆還沒結束的（這一屆的人走 public_team()，不走這裡）。
--
--   函式四支：
--     public_past_team()                 對外，沒登入也叫得到。只回打開的那幾屆。
--     past_team_admin()                  後台那一頁用：每一屆開了沒、名單、誰被藏了。Co-President 與 Senior Adviser。
--     set_past_team_public(term, on)     開或關一屆。只有 Co-President。這一屆（current）開不了。
--     set_past_team_hidden(person, on)   藏或放回一個人。只有 Co-President。
--
-- 沒有動的：people、positions、profiles、public_team()、public_founders()、任何既有的 RLS 政策。
-- terms 多三欄（past_public、past_public_by、past_public_at）；terms 本來就是誰都讀得到的表，這三欄也是，裡面沒有人的資料。
--
-- 要整個收回來：update public.terms set past_public = false; 對外那兩頁馬上變回「這一屆的名單還沒有放上來」。
-- ============================================================================

begin;

alter table public.terms add column if not exists past_public    boolean not null default false;
alter table public.terms add column if not exists past_public_by uuid references public.profiles(id) on delete set null;
alter table public.terms add column if not exists past_public_at timestamptz;
comment on column public.terms.past_public is
  '這一屆的名單要不要出現在對外的 /team/?term=（2026-11-25）。預設關；只有 Co-President 開得了（set_past_team_public），而且只有已經結束的屆。';

create table if not exists public.past_team_hidden (
  person_id uuid primary key references public.people(id) on delete cascade,
  hidden_by uuid references public.profiles(id) on delete set null,
  hidden_at timestamptz not null default now()
);
comment on table public.past_team_hidden is
  '不要出現在對外「前幾屆的團隊」上的人（2026-11-25）。一列一個人，每一屆都不出現。未滿 18 歲的人一律要在這裡。
   前端讀寫不到這張表，沒有任何 RLS 政策，只能走 set_past_team_hidden。';
alter table public.past_team_hidden enable row level security;
revoke all on public.past_team_hidden from public, anon, authenticated;

-- 對外。只回打開的、已經結束的那幾屆。一筆職位一列（同一屆兼兩個 team 的人會有兩列，畫面上兩個 team 都有他）。
create or replace function public.public_past_team()
returns table (term text, name_en text, name_zh text, team text, title_en text, title_zh text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select t.id, pe.name_en, pe.name_zh, po.team, po.title_en, po.title_zh
    from positions po
    join terms t on t.id = po.term_id and t.status = 'ended' and t.past_public
    join people pe on pe.id = po.person_id
   where pe.kind = 'member'
     and pe.forgotten_at is null
     and coalesce(nullif(btrim(pe.name_en), ''), nullif(btrim(pe.name_zh), '')) is not null
     and not exists (select 1 from past_team_hidden h where h.person_id = pe.id)
   order by t.id desc, pe.name_en nulls last, po.team nulls first;
$$;
revoke all on function public.public_past_team() from public;
grant execute on function public.public_past_team() to anon, authenticated;

-- 後台那一頁。每一屆一個物件：開了沒、誰開的時間、名單。名單裡每個人帶學校與畢業年（給 Co-President 判斷誰還沒成年用），
-- 還有他會不會出現（shown）與不會出現的原因（why：hidden 被藏了、not_member 學員或來賓、forgotten 本人要求移除、no_name 沒有名字）。
create or replace function public.past_team_admin()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_senior();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'term', t.id, 'public', t.past_public, 'public_at', t.past_public_at,
             'people', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'person', pe.id, 'name_en', pe.name_en, 'name_zh', pe.name_zh, 'team', po.team,
                        'title_en', po.title_en, 'title_zh', po.title_zh, 'school', pe.school, 'grad_year', pe.grad_year,
                        'has_account', pe.profile_id is not null,
                        'why', case when h.person_id is not null then 'hidden'
                                    when pe.kind <> 'member' then 'not_member'
                                    when pe.forgotten_at is not null then 'forgotten'
                                    when coalesce(nullif(btrim(pe.name_en), ''), nullif(btrim(pe.name_zh), '')) is null then 'no_name'
                                    else null end)
                      order by pe.name_en nulls last, po.team nulls first)
                 from positions po
                 join people pe on pe.id = po.person_id
                 left join past_team_hidden h on h.person_id = pe.id
                where po.term_id = t.id), '[]'::jsonb))
           order by t.id desc)
      from terms t where t.status = 'ended'), '[]'::jsonb);
end $$;
revoke all on function public.past_team_admin() from public, anon;
grant execute on function public.past_team_admin() to authenticated;

-- 開或關一屆。只有 Co-President：開了就是把一份沒有逐一同意過的名單放上對外頁。
create or replace function public.set_past_team_public(p_term text, p_on boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_status text;
begin
  if not public.is_president() then
    raise exception 'not_president' using errcode = 'P0001';
  end if;
  select status into v_status from terms where id = p_term;
  if v_status is null then
    raise exception 'no_such_term' using errcode = 'P0001';
  end if;
  if v_status <> 'ended' then
    -- 這一屆的人走 public_team()（本人同意加核可），不走這一條。
    raise exception 'term_not_ended' using errcode = 'P0001';
  end if;
  update terms
     set past_public    = coalesce(p_on, false),
         past_public_by = case when coalesce(p_on, false) then auth.uid() else past_public_by end,
         past_public_at = case when coalesce(p_on, false) then now() else past_public_at end
   where id = p_term;
  return coalesce(p_on, false);
end $$;
revoke all on function public.set_past_team_public(text, boolean) from public, anon;
grant execute on function public.set_past_team_public(text, boolean) to authenticated;

-- 藏或放回一個人。只有 Co-President。
create or replace function public.set_past_team_hidden(p_person uuid, p_on boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_president() then
    raise exception 'not_president' using errcode = 'P0001';
  end if;
  if not exists (select 1 from people where id = p_person) then
    raise exception 'no_such_person' using errcode = 'P0001';
  end if;
  if coalesce(p_on, false) then
    insert into past_team_hidden (person_id, hidden_by) values (p_person, auth.uid())
    on conflict (person_id) do nothing;
  else
    delete from past_team_hidden where person_id = p_person;
  end if;
  return coalesce(p_on, false);
end $$;
revoke all on function public.set_past_team_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_past_team_hidden(uuid, boolean) to authenticated;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, oid, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select
      (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'terms'
          and column_name in ('past_public', 'past_public_by', 'past_public_at')) = 3 as cols_ok,
      to_regclass('public.past_team_hidden') is not null as table_ok,
      (select bool_and(not has_table_privilege(r, 'public.past_team_hidden', p))
         from unnest(array['anon', 'authenticated']) r, unnest(array['select', 'insert', 'update', 'delete']) p) as private_ok,
      (select relrowsecurity from pg_class where oid = 'public.past_team_hidden'::regclass)
        and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'past_team_hidden') = 0 as rls_ok,
      (select bool_and(not has_table_privilege(r, 'public.terms', p))
         from unnest(array['anon', 'authenticated']) r, unnest(array['insert', 'update', 'delete']) p) as terms_ro,
      (select array_agg(proname::text order by proname) from fn
        where proname in ('public_past_team', 'past_team_admin', 'set_past_team_public', 'set_past_team_hidden')
          and has_function_privilege('anon', oid, 'execute')) as anon_fns,
      (select body like '%t.status = ''ended''%' and body like '%t.past_public%' from fn where proname = 'public_past_team') as only_open,
      (select body like '%pe.kind = ''member''%' and body like '%pe.forgotten_at is null%' and body like '%past_team_hidden%' from fn where proname = 'public_past_team') as leaves_out,
      (select body not like '%email%' and body not like '%avatar%' and body not like '%profile_id%' and body not like '%pe.id,%' and body not like '%school%' from fn where proname = 'public_past_team') as names_only,
      (select body like '%is_president()%' and body like '%not_president%' and body like '%term_not_ended%' from fn where proname = 'set_past_team_public') as open_gate,
      (select body like '%is_president()%' and body like '%not_president%' from fn where proname = 'set_past_team_hidden') as hide_gate,
      (select body like '%require_senior()%' from fn where proname = 'past_team_admin') as admin_gate,
      (select prosrc from pg_proc where proname = 'public_team' and pronamespace = 'public'::regnamespace) not like '%past_%' as team_untouched,
      (select count(*) from public.terms where status = 'ended') as ended_n,
      (select count(*) from public.terms where status = 'ended' and past_public) as open_n,
      (select count(*) from public.public_past_team()) as public_rows,
      (select coalesce(string_agg(x.id || ': ' || x.n, ', ' order by x.id desc), '沒有') from (
         select tt.id, count(po.id) as n from public.terms tt left join public.positions po on po.term_id = tt.id
          where tt.status = 'ended' group by tt.id) x) as per_term
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when cols_ok and table_ok and private_ok and rls_ok and terms_ro and anon_fns = array['public_past_team'] and only_open and leaves_out
              and names_only and open_gate and hide_gate and admin_gate and team_untouched
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, 'terms 多了三欄', 'true', cols_ok::text, case when cols_ok then 'PASS' else 'FAIL' end from t
  union all select 2, 'past_team_hidden 表在', 'true', table_ok::text, case when table_ok then 'PASS' else 'FAIL' end from t
  union all select 3, '★ past_team_hidden 前端讀寫都不行（anon 與登入的人）', 'true', private_ok::text, case when private_ok then 'PASS' else 'FAIL' end from t
  union all select 4, 'past_team_hidden 開了 RLS、沒有任何政策', 'true', rls_ok::text, case when rls_ok then 'PASS' else 'FAIL' end from t
  union all select 5, '★ terms 前端還是只能讀（開關只能走函式）', 'true', terms_ro::text, case when terms_ro then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 這一支的函式裡，沒登入叫得到的只有 public_past_team', '{public_past_team}', coalesce(anon_fns::text, '{}'), case when anon_fns = array['public_past_team'] then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 對外只回打開的、已經結束的屆', 'true', only_open::text, case when only_open then 'PASS' else 'FAIL' end from t
  union all select 8, '★ 學員與來賓、本人要求移除的、被藏的都不回', 'true', leaves_out::text, case when leaves_out then 'PASS' else 'FAIL' end from t
  union all select 9, '★ 對外只有名字、team、職位：沒有 email、照片、學校、任何 id', 'true', names_only::text, case when names_only then 'PASS' else 'FAIL' end from t
  union all select 10, '★ 開一屆只有 Co-President，而且這一屆開不了', 'true', open_gate::text, case when open_gate then 'PASS' else 'FAIL' end from t
  union all select 11, '★ 藏一個人只有 Co-President', 'true', hide_gate::text, case when hide_gate then 'PASS' else 'FAIL' end from t
  union all select 12, '後台看名單：Co-President 與 Senior Adviser', 'true', admin_gate::text, case when admin_gate then 'PASS' else 'FAIL' end from t
  union all select 13, 'public_team() 沒被動到', 'true', team_untouched::text, case when team_untouched then 'PASS' else 'FAIL' end from t
  union all select 20, '已經結束的屆有幾屆', '', ended_n::text, 'INFO' from t
  union all select 21, '其中打開的（第一次跑應該是 0）', '', open_n::text, 'INFO' from t
  union all select 22, '現在對外回幾列（第一次跑應該是 0）', '', public_rows::text, 'INFO' from t
  union all select 23, '每一屆名單上有幾筆職位', '', per_term, 'INFO' from t
) x order by ord;
