-- 很久以前來過的學員：「現在還在念高中」那一格取消（2026-11-26）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑（每年八月以後再跑一次，會把新滿三個學年的人也取消）。最後印一張 PASS / FAIL 表。
-- 要先跑過 2027-01-06-labels-and-schools.sql（rc_labels 收「學員」、left_high_school 的紀錄寫法）與 2027-01-16-member-label-rule.sql（三個學年那一條規則）。
--
-- Paul 2026-11-26：先是「a lot of student they attended event before and now they are definitely in the age of university」，
--   2027-01-16 那一支只改了標籤（畫面上變成「以前的學員」），沒有動「現在還在念高中」那一格（people.kind），因為那一格是兩道門在看的。
--   跑完之後正式站有 584 個人是「標籤寫以前的學員、那一格還勾著」。問他要不要一起取消，講了取消會打開哪兩道門，他選「Untick them」。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   對象（跟 2027-01-16 那一條標籤規則同一個算法）：種類是學員（people.kind = student）、沒寫畢業年、**沒有自己的帳號**、沒有被移除，
--     而且第一次以學員或 mentee 的身分來是三個學年以前（學年八月起算；沒有日期的舊活動用它那一屆的第一天）。
--     例：2023-24 學年來過的人當時最小是高一，2026 年 6 月畢業，所以 2026-27 起算在裡面；2024-25 才第一次來的不算。
--   對每一個人做三件事，跟「去向補了一筆就讀」的時候自動取消（rc_left_school_trg）是同一套：
--     1. people.kind 從 student 改成 guest（跟在他的頁面上把「現在還在念高中」取消一模一樣）。
--     2. 他如果沒有任何一筆「學員」身分的參與紀錄（例如只當過 mentee），留一個 BT 給的「學員」標籤（到他最晚畢業的那一年），
--        不然那一格取消之後畫面上就看不出他以前是學員了。已經有參與紀錄的人不用，標籤本來就從紀錄算。
--     3. 寫一列 rc_log（left_high_school，because = first_event，連同是哪一個學年第一次來）。
--
-- ⚠ 這一支會打開的兩道門（Paul 知道，這是他選的）：
--     - 這些人從此開得了個人連結（還在念高中的學員開不了）。連結還是要管得了紀錄的人一個一個去開，不會自己寄出去。
--     - 他們的去向可以連名字公開，**前提照舊是本人在個人連結上自己勾了同意**。這一支沒有替任何人勾同意。
--   這一條是用「第一次來的時間」推的，不是本人講的。當時如果是國中生來參加（比高一小），他現在可能還在念高中：
--   這種人請到他的頁面把「現在還在念高中」勾回去，並寫上畢業年（寫了畢業年的人這一支不會再動他）。
--
-- 不動的：有自己帳號的學員（那一格跟著帳號走，本來就鎖著）；寫了畢業年的人（照畢業年）；一場都沒來過的人；2024-25 以後才第一次來的人。
--   沒有新的表、沒有新的函式、沒有動 RLS。
--
-- 要還原：rc_log 裡 what = 'left_high_school'、after->>'because' = 'first_event' 的每一列，ref 是那個人，把他的 people.kind 改回 student；
--   這一支加的標籤是 label = 'student'、detail = 'Left high school (by first event year)' 的那幾列。
-- ============================================================================

begin;

do $$
declare r record; v_sy int := extract(year from (now() - interval '7 months'))::int; v_n int := 0; v_lab int := 0;
begin
  for r in
    select p.id,
           min(extract(year from (coalesce(e.starts_at::date, t.starts_on) - interval '7 months'))::int) as first_sy,
           bool_or(x.role = 'student') as was_student
      from public.people p
      join public.rc_participation x on x.person_id = p.id and x.role in ('student', 'mentee')
      join public.events e on e.id = x.event_id
      left join public.terms t on t.id = e.term_id
     where p.kind = 'student' and p.grad_year is null and p.profile_id is null and p.forgotten_at is null
     group by p.id
    having min(extract(year from (coalesce(e.starts_at::date, t.starts_on) - interval '7 months'))::int) + 3 <= v_sy
  loop
    update public.people set kind = 'guest' where id = r.id;
    if not r.was_student then
      insert into public.rc_labels (person_id, label, detail, since_year, until_year, set_by)
      values (r.id, 'student', 'Left high school (by first event year)', null, (r.first_sy + 3)::smallint, null)
      on conflict (person_id, label) do nothing;
      if found then v_lab := v_lab + 1; end if;
    end if;
    perform public.rc_log_it('left_high_school', r.id, jsonb_build_object('kind', 'student'),
      jsonb_build_object('kind', 'guest', 'because', 'first_event', 'first_school_year', r.first_sy, 'by', '2027-01-20-untick-aged-out-students'));
    v_n := v_n + 1;
  end loop;
  raise notice '「現在還在念高中」取消了 % 個人，其中 % 個人補了一個「學員」標籤', v_n, v_lab;
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with cur as (select extract(year from (now() - interval '7 months'))::int as sy),
  f as (
    select p.id, p.kind, p.grad_year, p.profile_id,
           min(extract(year from (coalesce(e.starts_at::date, t.starts_on) - interval '7 months'))::int) as first_sy
      from public.people p
      join public.rc_participation x on x.person_id = p.id and x.role in ('student', 'mentee')
      join public.events e on e.id = x.event_id
      left join public.terms t on t.id = e.term_id
     where p.forgotten_at is null
     group by p.id, p.kind, p.grad_year, p.profile_id
  ),
  done as (select l.ref as id from public.rc_log l where l.what = 'left_high_school' and l.after->>'because' = 'first_event'),
  t as (
    select
      (select count(distinct id)::int from done) as unticked,
      -- 還符合條件、卻還勾著的（應該是 0）
      (select count(*)::int from f, cur where f.kind = 'student' and f.grad_year is null and f.profile_id is null and f.first_sy + 3 <= cur.sy) as left_over,
      -- 這一支動過、現在的標籤裡卻看不出以前是學員的（應該是 0；之後有人把他勾回去或改了紀錄的不算）
      (select count(*)::int from done d join public.people p on p.id = d.id
        where p.forgotten_at is null and p.kind = 'guest'
          and not (public.rc_label_codes(p.id) ? 'student:past' or public.rc_label_codes(p.id) ? 'student')) as lost_label,
      -- 不該動的三種人，一個都沒有出現在這一支的紀錄裡
      (select count(*)::int from done d join public.people p on p.id = d.id where p.profile_id is not null) as touched_accounts,
      (select count(*)::int from done d join f on f.id = d.id, cur where f.first_sy + 3 > cur.sy) as touched_recent,
      (select count(*)::int from public.people p where p.kind = 'student' and p.forgotten_at is null) as still_student,
      (select count(*)::int from public.people p where p.kind = 'student' and p.forgotten_at is null and p.profile_id is not null) as still_student_accounts,
      (select count(*)::int from public.rc_labels where label = 'student' and detail = 'Left high school (by first event year)') as labels_added,
      (select count(*)::int from public.people p left join public.rc_label_codes_all() a on a.person_id = p.id
        where p.forgotten_at is null and coalesce(a.codes, '[]'::jsonb) is distinct from public.rc_label_codes(p.id)) as label_diff
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when left_over = 0 and lost_label = 0 and touched_accounts = 0 and touched_recent = 0 and label_diff = 0 then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '「現在還在念高中」被這一支取消的有幾個人（重跑不會重複算）', '', unticked::text, 'INFO' from t
  union all select 2, '★ 三個學年以前來過、沒寫畢業年、沒有帳號，卻還勾著的', '0', left_over::text, case when left_over = 0 then 'PASS' else 'FAIL' end from t
  union all select 3, '★ 取消之後，每一個人的標籤還看得出以前是學員', '0', lost_label::text, case when lost_label = 0 then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 有自己帳號的學員一個都沒動', '0', touched_accounts::text, case when touched_accounts = 0 then 'PASS' else 'FAIL' end from t
  union all select 5, '★ 還沒滿三個學年的一個都沒動', '0', touched_recent::text, case when touched_recent = 0 then 'PASS' else 'FAIL' end from t
  union all select 6, '現在還勾著「現在還在念高中」的有幾個人；其中有自己帳號的', '', still_student::text || '；' || still_student_accounts::text, 'INFO' from t
  union all select 7, '只當過 mentee、所以補了一個「學員」標籤的有幾個人', '', labels_added::text, 'INFO' from t
  union all select 8, '★ 名錄算的標籤跟一個人那一頁算的一模一樣（對不上的人數）', '0', label_diff::text, case when label_diff = 0 then 'PASS' else 'FAIL' end from t
) x order by ord;
