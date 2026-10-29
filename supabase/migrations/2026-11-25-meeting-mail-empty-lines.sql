-- 會議信：沒填的議程與會議紀錄，那一行整行不印　2026-11-25
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
--
-- Paul 2026-10-29：「會議紀錄有填才放進信裡，沒填就不要出現。」
-- 原本沒填的話，信裡印「會議紀錄：（開完會再補）」與「議程：（還沒寫）」。
--
-- 做法：只改 meeting_fill() 這一支（所有會議信都走它：邀請、提醒、更新、取消、總表）。
--   議程沒填，信裡有 {agenda} 的那一行整行拿掉；會議紀錄沒填，有 {doc} 的那一行整行拿掉。有填照舊代換。
--   後台「信件文案」改過的文案也一樣：只要那個符號自己一行就好。符號跟別的字寫在同一行的話，那一整行都會不見。
--   日曆邀請（Google 與 .ics）本來就只在有填的時候才放，這一支不動它們。資料表、權限都不動。
-- ============================================================================

begin;

create or replace function public.meeting_fill(p_text text, p_name text, p_title text, p_when text, p_agenda text, p_doc text, p_link text)
returns text language sql immutable
as $$
  select replace(replace(replace(replace(replace(replace(
           -- 沒填的那一格，含它的那一行（連行尾換行）拿掉
           regexp_replace(regexp_replace(coalesce(p_text, ''),
             case when coalesce(btrim(p_agenda), '') = '' then '[^\n]*\{agenda\}[^\n]*\n?' else '$^' end, '', 'g'),
             case when coalesce(btrim(p_doc), '') = '' then '[^\n]*\{doc\}[^\n]*\n?' else '$^' end, '', 'g'),
           '{name}', coalesce(p_name, '')), '{title}', coalesce(p_title, '')), '{when}', coalesce(p_when, '')),
           '{agenda}', coalesce(btrim(p_agenda), '')), '{doc}', coalesce(btrim(p_doc), '')),
           '{link}', coalesce(p_link, ''))
$$;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select public.meeting_fill(E'時間：{when}\n議程：{agenda}\n會議紀錄：{doc}\n\n{link}', 'A', 'T', '10:00', '', null, 'L') as c_none,
           public.meeting_fill(E'時間：{when}\n議程：{agenda}\n會議紀錄：{doc}\n\n{link}', 'A', 'T', '10:00', '海報', 'https://docs.google.com/x', 'L') as c_both,
           public.meeting_fill(E'議程：{agenda}\n會議紀錄：{doc}', 'A', 'T', 'w', '海報', '  ', 'L') as c_one
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when c_none = E'時間：10:00\n\nL' and c_both = E'時間：10:00\n議程：海報\n會議紀錄：https://docs.google.com/x\n\nL' and c_one = E'議程：海報\n' then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 兩格都沒填：那兩行不見，其他照舊', '時間：10:00 / 空行 / L', replace(c_none, E'\n', ' / '), case when c_none = E'時間：10:00\n\nL' then 'PASS' else 'FAIL' end from t
  union all select 2, '兩格都有填：照舊代換', '三行加連結', replace(c_both, E'\n', ' / '), case when c_both = E'時間：10:00\n議程：海報\n會議紀錄：https://docs.google.com/x\n\nL' then 'PASS' else 'FAIL' end from t
  union all select 3, '只有空白也算沒填', '議程：海報', replace(c_one, E'\n', ' / '), case when c_one = E'議程：海報\n' then 'PASS' else 'FAIL' end from t
  union all select 4, '信裡不再出現「開完會再補」「還沒寫」', 'false', ((select prosrc from pg_proc where proname = 'meeting_fill' limit 1) like '%開完會再補%')::text,
    case when (select prosrc from pg_proc where proname = 'meeting_fill' limit 1) not like '%開完會再補%' then 'PASS' else 'FAIL' end
) x order by ord;
