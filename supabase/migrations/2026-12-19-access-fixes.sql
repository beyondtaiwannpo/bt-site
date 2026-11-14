-- 2026-12-19：兩個權限修正（2026-11-13 後台盤點找到的，計畫在 ~/Anson/outputs/beyond-taiwan/website/docs/2026-11-13-admin-restructure-plan/）。
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 依賴：2026-10-29-invites.sql（invite_codes.rank）、2026-11-01-events.sql（events、events_read）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. ★ 安全：Senior Adviser 可以發一張「Co-President」或「Senior Adviser」的邀請。
--      invite_person() 的門是 require_senior()，Senior Adviser 本來就過得了；而對方用那張邀請註冊，
--      拿到的就是 Co-President。可是直接改職級的 set_board_role() 只有 Co-President 叫得動，
--      所以這是一條繞過去的路。
--      修法：在 invite_codes 上加一個 trigger，**不管從哪一支函式寫進來**，職級是 president 或 senior_adviser
--      的邀請只有 Co-President 發得出去（或改得成）。在 SQL Editor 直接跑（沒有登入的人，auth.uid() 是空的）不擋，
--      那是 Paul 自己。
--   2. 每一位幹部都看得到活動清單（Paul 2026-11-13 的盤點：沒被加進任何一場的幹部，Events 那一頁是空的，
--      以為壞掉）。活動那一列的內容本來就是要放上網站的東西（標題、時間、地點、介紹），不含報名的人。
--      **報名名單、表單答案、錢都沒有放寬**，那些各自有自己的門。改活動照舊只有被加進那一場「改」以上的人。
-- ============================================================================

begin;

-- ---------- 1. 高職級的邀請只有 Co-President 發得出去 ----------
create or replace function public.guard_invite_rank()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.rank in ('president', 'senior_adviser') and auth.uid() is not null and not public.is_president() then
    raise exception 'rank_needs_president' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.guard_invite_rank() from public, anon, authenticated;
drop trigger if exists invite_codes_rank_guard on public.invite_codes;
create trigger invite_codes_rank_guard before insert or update of rank on public.invite_codes
  for each row execute function public.guard_invite_rank();

-- ---------- 2. 幹部都看得到活動清單 ----------
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using (public.is_cadre() or public.can_view(workspace_id));

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select exists (select 1 from pg_trigger where tgname = 'invite_codes_rank_guard' and tgrelid = 'public.invite_codes'::regclass and not tgisinternal) as trig,
           (select regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%not public.is_president()%' from pg_proc where proname = 'guard_invite_rank' and pronamespace = 'public'::regnamespace) as trig_gate,
           (select qual like '%is_cadre()%' from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'events_read') as ev_read,
           (select count(*) from pg_policies where schemaname = 'public' and tablename = 'events' and cmd <> 'SELECT') = 0 as ev_no_write,
           not has_table_privilege('anon', 'public.events', 'select') as anon_out
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when trig and trig_gate and ev_read and ev_no_write and anon_out then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 邀請碼上有職級守門', 'true', trig::text, case when trig then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 守門問的是 Co-President', 'true', trig_gate::text, case when trig_gate then 'PASS' else 'FAIL' end from t
  union all select 3, '幹部都讀得到活動清單', 'true', ev_read::text, case when ev_read then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 活動表還是沒有寫的政策（改活動照舊走函式）', 'true', ev_no_write::text, case when ev_no_write then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 沒登入讀不到活動表', 'true', anon_out::text, case when anon_out then 'PASS' else 'FAIL' end from t
) x order by ord;
