-- 2026-11-23 把 seed 放進去的那一筆「寒假探索營」（代號 winter-bootcamp）整筆拿掉。
--
-- 為什麼：2026-12-31-programmes.sql 的 seed 放了一筆寒假探索營（這一屆叫 Overseas Unpacked，2027-01-03）。
-- 之後 Paul 在後台自己開了真的那一場（代號 overseas-unpacked，有完整的說明），對外頁上就變成同一場活動有兩筆。
-- Paul 2026-11-23：「take the seeded one off entirely」。
--
-- 這一支只跑一次，不是遷移檔（所以放在 snippets，不在 migrations，smoke.sh 不會跑它）。可以重跑：已經不在了就什麼都不做。
-- 它只刪「還是 seed 原本那個樣子」的那一筆：沒有報名表、沒有照片、講者、報名類型。
-- 只要有人在那一筆上面加過東西，它會停下來說原因，不會刪。刪掉之後救不回來。
begin;

do $$
declare
  e public.events%rowtype;
  n_photos int := 0; n_speakers int := 0; n_tickets int := 0;
begin
  select * into e from public.events where slug = 'winter-bootcamp';
  if not found then
    raise notice '代號 winter-bootcamp 的活動已經不在了，沒有東西要刪。';
    return;
  end if;
  if e.form_id is not null then
    raise exception '這一筆已經掛了報名表，可能有人報名了。先不刪，請在後台看過再決定。';
  end if;
  if to_regclass('public.event_photos') is not null then execute 'select count(*) from public.event_photos where event_id = $1' into n_photos using e.id; end if;
  if to_regclass('public.event_speakers') is not null then execute 'select count(*) from public.event_speakers where event_id = $1' into n_speakers using e.id; end if;
  if to_regclass('public.event_tickets') is not null then execute 'select count(*) from public.event_tickets where event_id = $1' into n_tickets using e.id; end if;
  if n_photos + n_speakers + n_tickets > 0 then
    raise exception '這一筆上面已經有照片、講者或報名類型（% 張、% 位、% 種）。先不刪，請在後台看過再決定。', n_photos, n_speakers, n_tickets;
  end if;

  delete from public.events where id = e.id;
  -- 那一筆自己的工作區（seed 建的，沒有擁有人）。還有別的活動或專案用它就留著。
  delete from public.workspaces w
   where w.id = e.workspace_id and w.id = 'custom:event-winter-bootcamp'
     and not exists (select 1 from public.events x where x.workspace_id = w.id or x.project_id = w.id);
  raise notice '刪掉了：%（%）', e.title_zh, e.slug;
end $$;

-- 驗收：那一筆不在了；Paul 自己開的那一場還在。
select 1 as "#", 'seed 的寒假探索營（winter-bootcamp）不在了' as "檢查",
       (select count(*) from public.events where slug = 'winter-bootcamp')::text as "實際",
       case when (select count(*) from public.events where slug = 'winter-bootcamp') = 0 then 'PASS' else 'FAIL' end as "結果"
union all
select 2, 'Paul 開的那一場（overseas-unpacked）還在',
       (select count(*) from public.events where slug = 'overseas-unpacked')::text,
       case when (select count(*) from public.events where slug = 'overseas-unpacked') = 1 then 'PASS' else '沒有這一筆（本機測試資料庫沒有是正常的）' end
order by 1;

commit;
