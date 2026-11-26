-- 紀錄：把每個人「備註」裡從舊名單匯進來的那些字，變成真的參與紀錄（2026-11-25）。
--
-- Paul 的原話：
--   「I want every note like this to be gone, but actually into our BT participation record.」
--   「whoever has that participation, don't delete their participation, but compare their notes and their participation
--     before you do anything.」
-- 備註長這樣：「BT: Event Attendee; since S2021; S21 Event Attendee; status: Student」。S 是春季那一期（2 月開始），F 是秋季（9 月開始）。
-- 動手之前 Paul 在正式資料庫跑過兩支只讀的查詢（寫法有哪幾種、備註跟已經有的參與紀錄差多少），這一支照那兩張表寫的。
--
-- 這一支做什麼：
--   1. 哪一期當 mentor／mentee（「F24 Mentee」「Mentor in F25, S26」「mentor F20 c1 c2 S21 c3」）：對那一期的 mentorship。
--      已經記了同一個身分的，不動。那一期他已經記成另一個身分的，**不補，那一段留在備註裡**給人看。其他的補一列。
--   2. 哪一期參加過活動：照比對出來的那一場補（例如「F22 Event Attendee」是 Study Abroad 101 (Fall 2022)）。那一場他已經有任何一列就不補。
--      用活動的英文名加日期找那一場，找不到就什麼都不做，那一段留在備註裡。
--   3. 資料庫裡沒有的三場（2021 春季兩場、2025 春季一場）：各開一場「名稱沒有紀錄」的過去活動（archived、不上對外頁、沒有日期），
--      把人掛上去。Paul 之後想起來是哪一場，在後台改名字就好。**沒有編日期**，那一格是空的。
--   4. 哪一期當過講者：那一期對得到一場的（F22、F24、F25、S26，S23、S24 有的話也是），補一列講者，備註寫「Inferred」。
--      對不到的（F23、S25 與其他）給一個「講者」標籤，補充說明寫哪一期。
--   5. Board：給一個「幹部」標籤，補充說明寫哪幾期。
--   6. 沒寫哪一期的（BT: Mentor、past mentee、BT: Event Attendee…）：已經有那種參與紀錄就算有了；沒有的給一個標籤，寫「term not recorded」。
--   7. 備註裡處理完的那幾段拿掉。**留著的**：HS dept（Paul 選的）、mentor(s): 名字、status: Graduate Student／Working Professional、
--      alumni map 2022、F23 alumni list、第 1、2 點說要留的、任何看不懂的字。沒有任何一段被拿掉的人，備註一個字都不動。
--
-- 守住的事：
--   - **已經有的參與紀錄一列都不刪、不改。** 最後那張表會數一次。
--   - 這一支加的每一列參與紀錄都是 source = 'import'，備註開頭是「From old database note: 」或「Inferred from old database note: 」。
--   - 這一支加的標籤，補充說明開頭是「Old database: 」。那個標籤本來就有人寫了補充說明的，接在後面，不蓋掉。
--     年份只寫備註裡有的：哪幾期就寫那幾期的年份；沒寫哪一期的，用「since」那一年當起訖（備註只知道那一年他在）。
--     「到哪一年」只替沒有帳號、也沒有職位的人寫（不寫的話系統會把他當成現在還是）；有帳號或職位的人不寫，讓系統照帳號與職位算。
--     「學員」標籤不寫到哪一年，他現在是不是學員看的是「現在還在念高中」那一格。
--   - 動備註之前，原本的整句存進 rc_note_backup 新的一欄 note_before_convert（2026-12-12 那一欄 note 存的是更早的版本，留著不動）。
--     那張表前端讀不到，forget_person 會整列清掉。**原文沒有寫進 rc_log**，因為 rc_log 在忘記一個人的時候不會清。
--     rc_log 只記「這個人被轉換過、加了幾列」，沒有任何備註的字。
--   - 沒有新的函式、沒有新的表、沒有動 RLS。多的只有 rc_note_backup 兩欄，加上（有人要掛的時候才開的）最多三場過去活動。
--
-- 可以重跑：第二次跑，備註裡已經沒有那些字，什麼都不會加。跑完看最後那張表，前面幾列都要是 PASS，後面的 INFO 是數字。
--
-- 要整個還原（照順序）：
--   delete from public.rc_participation where source = 'import' and note ~ '^(From|Inferred from) old database note: ';
--   update public.people p set note = b.note_before_convert from public.rc_note_backup b where b.person_id = p.id and b.note_before_convert is not null;
--   delete from public.rc_labels where set_by is null and detail like 'Old database: %';
--   update public.rc_labels set detail = regexp_replace(detail, '; Old database: .*$', '') where detail like '%; Old database: %';
--   delete from public.events where slug in ('spring-2021-event-1', 'spring-2021-event-2', 'spring-2025-event') and source = 'import' and status = 'archived';

begin;

drop table if exists n2p_result;

-- ---------- 0. 備份的那一欄，跟動手之前的樣子 ----------
alter table public.rc_note_backup add column if not exists note_before_convert text;
alter table public.rc_note_backup add column if not exists convert_at timestamptz;
comment on table public.rc_note_backup is
  '備註被程式改之前的原文。note：2026-12-12 把聯絡方式搬出去之前的。note_before_convert：2027-01-08 把舊名單的字變成參與紀錄之前的。只給資料庫管理者看，forget_person 會清。';

create temp table n2p_before on commit drop as select x.id, md5(x::text) as h from public.rc_participation x;
create temp table n2p_events_before on commit drop as select id from public.events;
create temp table n2p_labels_before on commit drop as select id, detail from public.rc_labels;

-- ---------- 1. 把備註拆成一段一段 ----------
create temp table n2p_people on commit drop as
  select id, note from public.people where coalesce(btrim(note), '') <> '' and forgotten_at is null;

create temp table n2p_tok on commit drop as
  select p.id as person_id, t.ord::int as ord, btrim(t.token) as token, null::text as shape, true as keep
    from n2p_people p, regexp_split_to_table(p.note, '\s*;\s*|\s+/\s+') with ordinality t(token, ord)
   where btrim(t.token) <> '';

update n2p_tok set shape = case
  when token ~* '^BT\s*:' then 'bt'
  when token ~* '^since\s+[SF]\d{4}$' then 'since'
  when token ~* '^status\s*:\s*(student|alumni)$' then 'status'
  when token ~* '^[a-z ]{2,12}\s*:\s*(\[link removed\])?$' then 'blank'
  when token ~* '^(mentor|mentee) in\s+[SF]\d\d(\s*,\s*[SF]\d\d)*$' then 'grp'
  when token ~* '^mentor(\s+[SF]\d\d(\s+c\d+)*)+$' then 'grp'
  when token ~* '^mentor before\s+[SF]\d\d$' then 'before'
  when token ~* '^past mentee$' then 'pastmentee'
  when token ~* '^(board|speaker|event speaker|mentor|mentee|event attendee)$' then 'bare'
  when token ~* '^[SF]\d\d\s+(mentor|mentee|board|speaker|event speaker|event attendee|event 2 attendee)(\s*,\s*[SF]\d\d\s+(mentor|mentee|board|speaker|event speaker|event attendee|event 2 attendee))*$' then 'terms'
  else 'other' end;

-- 一模一樣的一段聯絡方式出現在五個人以上的備註裡（例如每個人都是同一句 LinkedIn），那不是誰的聯絡方式，是舊名單留下來的空殼，當成空的拿掉。
update n2p_tok k set shape = 'blank'
 where k.shape = 'other' and k.token ~* '^(linkedin|line|ig|instagram|facebook|wechat|whatsapp|phone|email|website)\s*:'
   and (select count(distinct o.person_id) from n2p_tok o where lower(o.token) = lower(k.token)) >= 5;

-- 「BT: Mentor, Board」裡的每一個身分。有一個不認得的，那一整段就留著。
create temp table n2p_bt on commit drop as
  select k.person_id, k.ord, lower(btrim(r)) as role_word
    from n2p_tok k, regexp_split_to_table(regexp_replace(k.token, '^BT\s*:\s*', '', 'i'), '\s*,\s*') r
   where k.shape = 'bt' and btrim(r) <> '';
create temp table n2p_bt_bad on commit drop as
  select distinct person_id, ord from n2p_bt where role_word not in ('mentor', 'mentee', 'board', 'event attendee', 'event speaker', 'speaker');

-- ---------- 2. 備註講的每一件「哪一期、什麼身分」 ----------
create temp table n2p_claim on commit drop as
  with g as (
    select k.person_id, k.ord, case when k.token ~* '^mentee' then 'mentee' else 'mentor' end as role,
           upper(m[1]) as sem, 2000 + m[2]::int as yr,
           nullif(btrim(regexp_replace(coalesce(m[3], ''), '\s*c(\d+)', ', \1', 'gi'), ', '), '') as cohort
      from n2p_tok k, regexp_matches(k.token, '\m([SF])(\d\d)\M((?:\s+c\d+)*)', 'gi') m
     where k.shape = 'grp'),
  t as (
    select k.person_id, k.ord, btrim(s) as piece from n2p_tok k, regexp_split_to_table(k.token, '\s*,\s*') s where k.shape = 'terms')
  select person_id, ord, role, sem, yr, cohort from g
  union all
  select person_id, ord,
         case when piece ~* 'event 2 attendee$' then 'attendee2' when piece ~* 'event attendee$' then 'attendee' when piece ~* 'speaker$' then 'speaker'
              when piece ~* 'board$' then 'board' when piece ~* 'mentee$' then 'mentee' else 'mentor' end,
         upper(substr(piece, 1, 1)), 2000 + substr(piece, 2, 2)::int, null::text
    from t;

create temp table n2p_c on commit drop as
  select person_id, role, sem, yr, sem || lpad((yr % 100)::text, 2, '0') as term,
         case sem when 'F' then 'Fall ' else 'Spring ' end || yr as term_name,
         max(cohort) as cohort, null::uuid as event_id, false as mapped, false as inferred, null::text as res
    from n2p_claim group by person_id, role, sem, yr;

-- ---------- 3. 活動：哪一期對哪一場（照 2026-11-25 比對的結果） ----------
create temp table n2p_map (term text, role text, title text, day date, slug text, inferred boolean, event_id uuid) on commit drop;
insert into n2p_map (term, role, title, day, slug, inferred) values
  ('F22', 'attendee',  'Study Abroad 101 (Fall 2022)', '2022-10-15', null, false),
  ('S23', 'attendee',  'Summer Bootcamp 2023',         '2023-06-10', null, false),
  ('F23', 'attendee2', 'Study Abroad 101 (Fall 2023)', '2023-10-21', null, false),
  ('F23', 'attendee',  'Winter Bootcamp 2024',         '2024-01-20', null, true),
  ('S24', 'attendee',  'Summer Bootcamp 2024',         '2024-07-06', null, false),
  ('F24', 'attendee',  'Study Abroad 101 (Fall 2024)', '2024-10-27', null, false),
  ('F25', 'attendee',  'Winter Bootcamp 2026',         '2026-01-10', null, false),
  ('S26', 'attendee',  'Summer Bootcamp 2026',         '2026-06-06', null, false),
  ('F22', 'speaker',   'Study Abroad 101 (Fall 2022)', '2022-10-15', null, true),
  ('S23', 'speaker',   'Summer Bootcamp 2023',         '2023-06-10', null, true),
  ('S24', 'speaker',   'Summer Bootcamp 2024',         '2024-07-06', null, true),
  ('F24', 'speaker',   'Study Abroad 101 (Fall 2024)', '2024-10-27', null, true),
  ('F25', 'speaker',   'Winter Bootcamp 2026',         '2026-01-10', null, true),
  ('S26', 'speaker',   'Summer Bootcamp 2026',         '2026-06-06', null, true),
  ('S21', 'attendee',  null, null, 'spring-2021-event-1', false),
  ('S21', 'attendee2', null, null, 'spring-2021-event-2', false),
  ('S25', 'attendee',  null, null, 'spring-2025-event',   false);

-- 資料庫裡沒有的那三場：有人要掛才開，沒有日期，不上對外頁。
insert into public.events (slug, team, workspace_id, title_zh, title_en, status, kind, term_id, source)
select ph.slug, '', 'custom:records', ph.title_zh, ph.title_en, 'archived', 'other', (select id from public.terms where id = ph.term_id), 'import'
  from (values
    ('spring-2021-event-1', '2021 春季活動 1（名稱沒有紀錄）', 'Spring 2021 event 1 (name not recorded)', '2020-21', 'S21', 'attendee'),
    ('spring-2021-event-2', '2021 春季活動 2（名稱沒有紀錄）', 'Spring 2021 event 2 (name not recorded)', '2020-21', 'S21', 'attendee2'),
    ('spring-2025-event',   '2025 春季活動（名稱沒有紀錄）',   'Spring 2025 event (name not recorded)',   '2024-25', 'S25', 'attendee')
  ) ph(slug, title_zh, title_en, term_id, term, role)
 where exists (select 1 from n2p_c c where c.term = ph.term and c.role = ph.role)
   and exists (select 1 from public.workspaces where id = 'custom:records')
on conflict (slug) do nothing;

update n2p_map m set event_id = case
  when m.slug is not null then (select e.id from public.events e where e.slug = m.slug and e.source = 'import' and e.status = 'archived')
  else (select min(e.id::text)::uuid from public.events e
         where coalesce(nullif(btrim(e.title_en), ''), btrim(e.title_zh)) = m.title
           and (e.starts_at at time zone 'Asia/Taipei')::date = m.day and e.kind is distinct from 'mentorship-term'
        having count(*) = 1) end;

-- 導生：那一期開始的 mentorship（秋季 8 到 12 月開始的那一場，春季 1 到 7 月）
update n2p_c c set mapped = true, event_id = (
  select e.id from public.events e
   where e.kind = 'mentorship-term'
     and (e.starts_at at time zone 'Asia/Taipei')::date >= case when c.sem = 'F' then make_date(c.yr, 8, 1) else make_date(c.yr, 1, 1) end
     and (e.starts_at at time zone 'Asia/Taipei')::date <  case when c.sem = 'F' then make_date(c.yr + 1, 1, 1) else make_date(c.yr, 8, 1) end
   order by e.starts_at limit 1)
 where c.role in ('mentor', 'mentee');
update n2p_c c set mapped = true, event_id = m.event_id, inferred = m.inferred
  from n2p_map m where m.term = c.term and m.role = c.role and c.role in ('attendee', 'attendee2', 'speaker');

-- ---------- 4. 每一件怎麼處理 ----------
--   covered  已經有了，不動           add     補一列
--   conflict 那一場他已經是另一個身分，不補，那一段留在備註
--   noevent  找不到那一場，不補，那一段留在備註
--   label    變成標籤（Board，以及對不到場次的講者）
update n2p_c c set res = case
  when c.role = 'board' then 'label'
  when c.role = 'speaker' and not c.mapped then 'label'
  when c.event_id is null then 'noevent'
  when c.role in ('attendee', 'attendee2') then
    case when exists (select 1 from public.rc_participation x where x.person_id = c.person_id and x.event_id = c.event_id) then 'covered'
         -- 同一場他的備註又說當過講者：只補講者那一列，不補兩列
         when exists (select 1 from n2p_c o where o.person_id = c.person_id and o.role = 'speaker' and o.event_id = c.event_id) then 'covered'
         else 'add' end
  when exists (select 1 from public.rc_participation x where x.person_id = c.person_id and x.event_id = c.event_id and x.role = c.role) then 'covered'
  when exists (select 1 from public.rc_participation x where x.person_id = c.person_id and x.event_id = c.event_id) then 'conflict'
  when c.role in ('mentor', 'mentee') and exists (select 1 from n2p_c o where o.person_id = c.person_id and o.sem = c.sem and o.yr = c.yr
                                                    and o.role in ('mentor', 'mentee') and o.role <> c.role) then 'conflict'
  else 'add' end;

insert into public.rc_participation (person_id, event_id, role, status, source, note)
select c.person_id, c.event_id,
       case when c.role in ('attendee', 'attendee2') then 'student' else c.role end,
       'attended', 'import',
       case when c.inferred then 'Inferred from old database note: ' else 'From old database note: ' end || c.term || ' '
         || case c.role when 'mentor' then 'Mentor' when 'mentee' then 'Mentee' when 'speaker' then 'Speaker'
                        when 'attendee2' then 'Event 2 Attendee' else 'Event Attendee' end
         || case when c.inferred then ' (the note names the term, not the event)' else '' end
         || case when c.cohort is not null then '; cohort ' || c.cohort else '' end
  from n2p_c c where c.res = 'add'
on conflict do nothing;

-- ---------- 5. 標籤 ----------
-- 每個人備註裡沒寫哪一期的那幾種說法，跟他的 since。
create temp table n2p_says on commit drop as
  select p.id as person_id,
         exists (select 1 from n2p_tok k where k.person_id = p.id and ((k.shape = 'bare' and lower(k.token) = 'mentor')
                   or (k.shape = 'bt' and exists (select 1 from n2p_bt b where b.person_id = k.person_id and b.ord = k.ord and b.role_word = 'mentor')
                       and not exists (select 1 from n2p_bt_bad x where x.person_id = k.person_id and x.ord = k.ord)))) as mentor,
         exists (select 1 from n2p_tok k where k.person_id = p.id and (k.shape = 'pastmentee' or (k.shape = 'bare' and lower(k.token) = 'mentee')
                   or (k.shape = 'bt' and exists (select 1 from n2p_bt b where b.person_id = k.person_id and b.ord = k.ord and b.role_word = 'mentee')
                       and not exists (select 1 from n2p_bt_bad x where x.person_id = k.person_id and x.ord = k.ord)))) as mentee,
         exists (select 1 from n2p_tok k where k.person_id = p.id and ((k.shape = 'bare' and lower(k.token) = 'event attendee')
                   or (k.shape = 'bt' and exists (select 1 from n2p_bt b where b.person_id = k.person_id and b.ord = k.ord and b.role_word = 'event attendee')
                       and not exists (select 1 from n2p_bt_bad x where x.person_id = k.person_id and x.ord = k.ord)))) as attendee,
         exists (select 1 from n2p_tok k where k.person_id = p.id and ((k.shape = 'bare' and lower(k.token) in ('speaker', 'event speaker'))
                   or (k.shape = 'bt' and exists (select 1 from n2p_bt b where b.person_id = k.person_id and b.ord = k.ord and b.role_word in ('speaker', 'event speaker'))
                       and not exists (select 1 from n2p_bt_bad x where x.person_id = k.person_id and x.ord = k.ord)))) as speaker,
         exists (select 1 from n2p_tok k where k.person_id = p.id and ((k.shape = 'bare' and lower(k.token) = 'board')
                   or (k.shape = 'bt' and exists (select 1 from n2p_bt b where b.person_id = k.person_id and b.ord = k.ord and b.role_word = 'board')
                       and not exists (select 1 from n2p_bt_bad x where x.person_id = k.person_id and x.ord = k.ord)))) as board,
         (select '; with BT since ' || case upper(substr(s, 1, 1)) when 'F' then 'Fall ' else 'Spring ' end || substr(s, 2, 4)
            from (select regexp_replace(k.token, '^since\s+', '', 'i') as s from n2p_tok k where k.person_id = p.id and k.shape = 'since' order by k.ord limit 1) z) as since_txt,
         (select substr(regexp_replace(k.token, '^since\s+', '', 'i'), 2, 4)::int from n2p_tok k where k.person_id = p.id and k.shape = 'since' order by k.ord limit 1) as since_yr,
         -- 沒有帳號、也沒有任何一期職位的人：系統不會自己算出他「現在還是」，所以標籤要寫到哪一年，不然會被當成現在還是。
         -- 有帳號或有職位的人不寫到哪一年，讓系統照他的帳號與職位算。
         (select pe.profile_id is null and not exists (select 1 from public.positions po where po.person_id = pe.id) from public.people pe where pe.id = p.id) as nocur
    from n2p_people p;

create temp table n2p_lab_raw (person_id uuid, label text, detail text, since_year int, until_year int, ord int) on commit drop;

-- Board
insert into n2p_lab_raw
select c.person_id, 'member', 'Board: ' || string_agg(c.term, ', ' order by c.yr, c.sem desc), min(c.yr),
       case when bool_and(s.nocur) then max(case when c.sem = 'F' then c.yr + 1 else c.yr end) end, 1
  from n2p_c c join n2p_says s on s.person_id = c.person_id where c.role = 'board' group by c.person_id;
insert into n2p_lab_raw
select s.person_id, 'member', 'Board (term not recorded)' || coalesce(s.since_txt, ''), s.since_yr, case when s.nocur then s.since_yr end, 1
  from n2p_says s where s.board and not exists (select 1 from n2p_c c where c.person_id = s.person_id and c.role = 'board');
-- 講者：對不到場次的那幾期
insert into n2p_lab_raw
select c.person_id, 'speaker', 'Speaker, ' || string_agg(c.term_name, ', ' order by c.yr, c.sem desc) || ' (event not recorded)', min(c.yr),
       case when bool_and(s.nocur) then max(case when c.sem = 'F' then c.yr + 1 else c.yr end) end, 1
  from n2p_c c join n2p_says s on s.person_id = c.person_id where c.role = 'speaker' and c.res = 'label' group by c.person_id;
-- 講者：沒寫哪一期，也沒有任何講者紀錄
insert into n2p_lab_raw
select s.person_id, 'speaker', 'Speaker (term not recorded)' || coalesce(s.since_txt, ''), s.since_yr, case when s.nocur then s.since_yr end, 2
  from n2p_says s where s.speaker and not exists (select 1 from n2p_c c where c.person_id = s.person_id and c.role = 'speaker')
   and not exists (select 1 from public.rc_participation x where x.person_id = s.person_id and x.role = 'speaker');
-- Mentor：「mentor before F21」
insert into n2p_lab_raw
select k.person_id, 'mentor', 'Mentor before ' || case upper(substr(z.t, 1, 1)) when 'F' then 'Fall ' else 'Spring ' end || (2000 + substr(z.t, 2, 2)::int), null,
       case when s.nocur then 2000 + substr(z.t, 2, 2)::int end, 1
  from n2p_tok k join n2p_says s on s.person_id = k.person_id, lateral (select (regexp_match(k.token, '([SFsf]\d\d)$'))[1] as t) z where k.shape = 'before';
-- Mentor／Mentee／參加過活動：沒寫哪一期，也沒有那種紀錄
insert into n2p_lab_raw
select s.person_id, 'mentor', 'Mentor (term not recorded)' || coalesce(s.since_txt, ''), s.since_yr, case when s.nocur then s.since_yr end, 2
  from n2p_says s where s.mentor and not exists (select 1 from n2p_c c where c.person_id = s.person_id and c.role = 'mentor')
   and not exists (select 1 from n2p_tok k where k.person_id = s.person_id and k.shape = 'before')
   and not exists (select 1 from public.rc_participation x where x.person_id = s.person_id and x.role = 'mentor');
insert into n2p_lab_raw
select s.person_id, 'mentee', 'Mentee (term not recorded)' || coalesce(s.since_txt, ''), s.since_yr, case when s.nocur then s.since_yr end, 2
  from n2p_says s where s.mentee and not exists (select 1 from n2p_c c where c.person_id = s.person_id and c.role = 'mentee')
   and not exists (select 1 from public.rc_participation x where x.person_id = s.person_id and x.role = 'mentee');
insert into n2p_lab_raw
select s.person_id, 'student', 'Event attendee (event not recorded)' || coalesce(s.since_txt, ''), s.since_yr, null, 2
  from n2p_says s where s.attendee and not exists (select 1 from n2p_c c where c.person_id = s.person_id and c.role in ('attendee', 'attendee2'))
   and not exists (select 1 from public.rc_participation x join public.events e on e.id = x.event_id
                    where x.person_id = s.person_id and e.kind is distinct from 'mentorship-term');

create temp table n2p_lab on commit drop as
  select person_id, label, left('Old database: ' || string_agg(distinct detail, '; '), 160) as detail, min(since_year)::smallint as since_year, max(until_year)::smallint as until_year
    from n2p_lab_raw group by person_id, label;

-- 那個標籤本來就有的：補充說明是空的才填，有字就接在後面，年份不動。
insert into public.rc_labels (person_id, label, detail, since_year, until_year)
select person_id, label, detail, since_year, until_year from n2p_lab
on conflict (person_id, label) do update set detail = case
  when btrim(public.rc_labels.detail) = '' then excluded.detail
  when position(excluded.detail in public.rc_labels.detail) > 0 then public.rc_labels.detail
  else left(public.rc_labels.detail || '; ' || excluded.detail, 160) end;

-- ---------- 6. 備註：處理完的拿掉，其他照原本的順序留著 ----------
update n2p_tok k set keep = case
  when k.shape = 'other' then true
  when k.shape = 'bt' then exists (select 1 from n2p_bt_bad x where x.person_id = k.person_id and x.ord = k.ord)
  when k.shape = 'since' then exists (select 1 from n2p_bt_bad x where x.person_id = k.person_id)
  when k.shape in ('grp', 'terms') then exists (
         select 1 from n2p_claim cl join n2p_c c on c.person_id = cl.person_id and c.role = cl.role and c.sem = cl.sem and c.yr = cl.yr
          where cl.person_id = k.person_id and cl.ord = k.ord and c.res in ('conflict', 'noevent'))
  else false end;

create temp table n2p_new on commit drop as
  select p.id, p.note as old_note,
         nullif(coalesce(string_agg(k.token, '; ' order by k.ord) filter (where k.keep), ''), '') as new_note,
         coalesce(bool_or(not k.keep), false) as changed
    from n2p_people p join n2p_tok k on k.person_id = p.id group by p.id, p.note;

insert into public.rc_note_backup (person_id, note, note_before_convert, convert_at)
select id, old_note, old_note, now() from n2p_new where changed
on conflict (person_id) do update set
  note_before_convert = coalesce(public.rc_note_backup.note_before_convert, excluded.note_before_convert),
  convert_at = coalesce(public.rc_note_backup.convert_at, excluded.convert_at);

update public.people p set note = n.new_note from n2p_new n where n.id = p.id and n.changed;

-- 變動紀錄：只記「轉換過、加了幾列」，沒有備註的字（rc_log 在忘記一個人的時候不會清）。
insert into public.rc_log (what, ref, who, before, after)
select 'note_to_participation', n.id, null, null,
       jsonb_build_object('rows_added', (select count(*) from public.rc_participation x where x.person_id = n.id and not exists (select 1 from n2p_before b where b.id = x.id)),
                          'labels', coalesce((select jsonb_agg(l.label order by l.label) from n2p_lab l where l.person_id = n.id), '[]'::jsonb),
                          'note_left', n.new_note is not null)
  from n2p_new n where n.changed;

-- ---------- 7. 數一次，留給最後那張表 ----------
create temp table n2p_result as
with added as (select x.*, e.slug, e.kind as ekind from public.rc_participation x join public.events e on e.id = x.event_id where not exists (select 1 from n2p_before b where b.id = x.id)),
kept as (
  select k.person_id,
         case when k.shape in ('grp', 'terms') then
                case when exists (select 1 from n2p_claim cl join n2p_c c on c.person_id = cl.person_id and c.role = cl.role and c.sem = cl.sem and c.yr = cl.yr
                                   where cl.person_id = k.person_id and cl.ord = k.ord and c.res = 'conflict') then 'conflict' else 'noevent' end
              when k.shape in ('bt', 'since') then 'bt'
              when k.token ~* '^HS dept' then 'hs'
              when k.token ~* '^(mentor|mentee)\(s\)' then 'names'
              when k.token ~* '^status\s*:' then 'status'
              when k.token ~* 'alumni (map|list)' then 'lists'
              when k.token ~* '^(linkedin|line|ig|instagram|facebook|wechat|whatsapp|phone|email|website)\s*:' then 'contact'
              else 'free' end as why
    from n2p_tok k join n2p_new n on n.id = k.person_id where k.keep)
select
  (select count(*) from n2p_before)::int as pre_rows,
  (select count(*) from n2p_before b where not exists (select 1 from public.rc_participation x where x.id = b.id))::int as pre_missing,
  (select count(*) from n2p_before b join public.rc_participation x on x.id = b.id where md5(x::text) <> b.h)::int as pre_changed,
  (select count(*) from added)::int as added_total,
  (select count(*) from added where source <> 'import' or status <> 'attended' or note !~ '^(From|Inferred from) old database note: ')::int as added_bad,
  (select count(*) from added a where exists (select 1 from public.rc_participation o where o.person_id = a.person_id and o.event_id = a.event_id and o.id <> a.id))::int as added_clash,
  (select count(*) from added where role = 'mentor')::int as add_mentor,
  (select count(*) from added where role = 'mentee')::int as add_mentee,
  (select count(*) from added where role = 'student' and slug not in ('spring-2021-event-1', 'spring-2021-event-2', 'spring-2025-event'))::int as add_known,
  (select count(*) from added where role = 'student' and slug in ('spring-2021-event-1', 'spring-2021-event-2', 'spring-2025-event'))::int as add_placeholder,
  (select count(*) from added where role = 'speaker')::int as add_speaker,
  (select count(*) from public.events e where e.slug in ('spring-2021-event-1', 'spring-2021-event-2', 'spring-2025-event')
      and not exists (select 1 from n2p_events_before b where b.id = e.id))::int as ph_created,
  (select count(*) from public.events e where not exists (select 1 from n2p_events_before b where b.id = e.id)
      and (e.status <> 'archived' or e.source <> 'import' or e.starts_at is not null or e.slug not in ('spring-2021-event-1', 'spring-2021-event-2', 'spring-2025-event')))::int as ph_bad,
  (select count(*) from public.rc_labels l where not exists (select 1 from n2p_labels_before b where b.id = l.id))::int as lab_new,
  (select count(*) from public.rc_labels l join n2p_labels_before b on b.id = l.id where l.detail <> b.detail)::int as lab_appended,
  (select count(*) from public.rc_labels l where not exists (select 1 from n2p_labels_before b where b.id = l.id) and (l.detail not like 'Old database: %' or l.set_by is not null))::int as lab_bad,
  (select count(*) from public.rc_labels l join n2p_labels_before b on b.id = l.id where l.detail <> b.detail and btrim(b.detail) <> '' and position(b.detail in l.detail) <> 1)::int as lab_overwritten,
  (select coalesce(string_agg(label || ' ' || n, ', ' order by label), '-') from (select l.label, count(*) as n from public.rc_labels l
      where not exists (select 1 from n2p_labels_before b where b.id = l.id) group by l.label) z) as lab_by,
  (select count(*) from n2p_new where changed)::int as people_changed,
  (select count(*) from n2p_new where changed and new_note is null)::int as notes_empty,
  (select count(*) from n2p_new n where n.changed and not exists (select 1 from public.rc_note_backup b where b.person_id = n.id and b.note_before_convert is not null))::int as backup_missing,
  (select count(*) from n2p_new n where n.old_note ~* 'HS dept\s*:\s*\S' and coalesce(n.new_note, '') !~* 'HS dept\s*:')::int as hs_lost,
  (select count(*) from n2p_new n join public.people p on p.id = n.id where coalesce(p.note, '') <> coalesce(case when n.changed then n.new_note else n.old_note end, ''))::int as note_mismatch,
  (select count(*) from public.people p where coalesce(btrim(p.note), '') <> '' and p.forgotten_at is null)::int as notes_left,
  (select count(distinct person_id) from kept where why = 'hs')::int as left_hs,
  (select count(distinct person_id) from kept where why = 'names')::int as left_names,
  (select count(distinct person_id) from kept where why = 'conflict')::int as left_conflict,
  (select count(distinct person_id) from kept where why = 'noevent')::int as left_noevent,
  (select count(distinct person_id) from kept where why in ('status', 'lists'))::int as left_lists,
  (select count(distinct person_id) from kept where why = 'bt')::int as left_bt,
  (select count(distinct person_id) from kept where why = 'contact')::int as left_contact,
  (select count(distinct person_id) from n2p_tok where shape = 'blank')::int as blank_people,
  (select count(distinct person_id) from kept where why = 'free')::int as left_free;

commit;

-- ---------- 驗收 ----------
select * from (
  with fn as (select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body from pg_proc where pronamespace = 'public'::regnamespace),
  t as (
    select r.*,
           (select body like '%rc_note_backup%' from fn where proname = 'rc_forget_rows') as forget_ok,
           (not has_table_privilege('authenticated', 'public.rc_note_backup', 'select') and not has_table_privilege('anon', 'public.rc_note_backup', 'select')) as backup_private,
           (select count(*) from public.events e where e.slug in ('spring-2021-event-1', 'spring-2021-event-2', 'spring-2025-event') and e.source = 'import' and e.status <> 'archived')::int as ph_public
      from n2p_result r)
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when pre_missing = 0 and pre_changed = 0 and added_bad = 0 and added_clash = 0 and ph_bad = 0 and ph_public = 0 and lab_bad = 0 and lab_overwritten = 0
              and backup_missing = 0 and hs_lost = 0 and note_mismatch = 0 and forget_ok and backup_private
         then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '★ 原本就有的參與紀錄：一列都沒有少、一列都沒有被改（少的｜被改的）', '0|0', pre_missing || '|' || pre_changed, case when pre_missing = 0 and pre_changed = 0 then 'PASS' else 'FAIL' end from t
  union all select 2, '★ 這一次加的每一列都是 import、attended、備註開頭是那兩句之一（不是的有幾列）', '0', added_bad::text, case when added_bad = 0 then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 這一次加的列，沒有一列是加在「那一場他已經有別的紀錄」的人身上', '0', added_clash::text, case when added_clash = 0 then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 新開的活動只有那三場、都是 archived、import、沒有日期（不合的有幾場）', '0', (ph_bad + ph_public)::text, case when ph_bad = 0 and ph_public = 0 then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 新給的標籤都以 Old database: 開頭；原本有字的補充說明沒有被蓋掉', '0|0', lab_bad || '|' || lab_overwritten, case when lab_bad = 0 and lab_overwritten = 0 then 'PASS' else 'FAIL' end from t
  union all select 6, '★ 備註被動到的人，原文都存進備份了（沒存到的有幾位）', '0', backup_missing::text, case when backup_missing = 0 then 'PASS' else 'FAIL' end from t
  union all select 7, '★ 備份前端讀不到，forget_person 會清', 'true', (forget_ok and backup_private)::text, case when forget_ok and backup_private then 'PASS' else 'FAIL' end from t
  union all select 8, '★ HS dept 沒有從任何人的備註裡不見；備註現在的樣子跟算出來的一樣', '0|0', hs_lost || '|' || note_mismatch, case when hs_lost = 0 and note_mismatch = 0 then 'PASS' else 'FAIL' end from t
  union all select 10, '這一次加了幾列參與紀錄（重跑應該是 0）', '-', added_total::text, 'INFO' from t
  union all select 11, '其中 mentor｜mentee', '-', add_mentor || '|' || add_mentee, 'INFO' from t
  union all select 12, '其中參加活動：對得到的那幾場｜新開的那三場', '-', add_known || '|' || add_placeholder, 'INFO' from t
  union all select 13, '其中講者（推論到那一期的那一場）', '-', add_speaker::text, 'INFO' from t
  union all select 14, '這一次新開的過去活動', '-', ph_created::text, 'INFO' from t
  union all select 15, '這一次新給的標籤｜接在原本補充說明後面的', '-', lab_new || '|' || lab_appended, 'INFO' from t
  union all select 16, '新給的標籤各幾個', '-', lab_by, 'INFO' from t
  union all select 17, '備註被動到的人｜其中備註變成空的', '-', people_changed || '|' || notes_empty, 'INFO' from t
  union all select 18, '原本就有的參與紀錄列數（沒有變）', '-', pre_rows::text, 'INFO' from t
  union all select 20, '現在還有備註的人', '-', notes_left::text, 'INFO' from t
  union all select 21, '還留著的原因：HS dept', '-', left_hs::text, 'INFO' from t
  union all select 22, '還留著的原因：mentor(s) 的名字', '-', left_names::text, 'INFO' from t
  union all select 23, '還留著的原因：那一期他已經記成另一個身分（要人看）', '-', left_conflict::text, 'INFO' from t
  union all select 24, '還留著的原因：找不到那一場活動', '-', left_noevent::text, 'INFO' from t
  union all select 25, '還留著的原因：status（研究生、工作）與 alumni map／list', '-', left_lists::text, 'INFO' from t
  union all select 26, '還留著的原因：BT: 那一段有不認得的身分', '-', left_bt::text, 'INFO' from t
  union all select 27, '還留著的原因：一段聯絡方式（2026-12-12 沒搬走的）', '-', left_contact::text, 'INFO' from t
  union all select 28, '還留著的原因：其他自己寫的字', '-', left_free::text, 'INFO' from t
  union all select 29, '被當成空殼拿掉聯絡方式那一段的人（空的，或同一句出現在五個人以上）', '-', blank_people::text, 'INFO' from t
) x order by ord;
