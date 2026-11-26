-- 聯絡方式掛錯種類的搬回對的那一種：掛在 LinkedIn 底下的 Facebook 連結變成 Facebook（2026-11-26）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑。最後印一張 PASS / FAIL 表。
-- 要先跑過 2026-12-12-records-contacts.sql（聯絡方式的九種、rc_contact_norm、rc_log_it）。
--
-- Paul 2026-11-26（貼著一個人的頁面，LinkedIn 那一行是一條 facebook.com 的連結）：
--   「Can you change the heading of these link like this is obviously facebook then change it to facebook, check all others」
--
-- 查到的（正式站，2026-11-26，1250 個人全部看過）：
--   掛在 LinkedIn 底下的 120 筆裡，真的是 LinkedIn 連結的只有 4 筆。98 筆是 Facebook 連結、5 筆是 Instagram 連結、1 筆是 LINE 連結、
--   1 筆是別的網址、11 筆不是連結（一個名字或帳號，看不出是哪裡的）。都是 2026-12-12 從備註搬出來的：舊名單那一欄叫 LinkedIn，大家填的多半是臉書。
--   其他種類沒有掛錯的（email 1247、LINE 56、Instagram 39、電話 16、Facebook 2 都對）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   看的是那一筆的字本身是哪一個網站的連結：
--     facebook.com、fb.com、fb.me        → Facebook
--     instagram.com                      → Instagram（存成帳號，跟其他 Instagram 一樣，不存整條網址）
--     linkedin.com                       → LinkedIn
--     line.me、lin.ee                    → LINE
--     wa.me、whatsapp.com                → WhatsApp
--     其他 http(s):// 或 www. 開頭的網址 → 網站
--   認得出來、而且跟現在掛的種類不一樣的，改成對的那一種。**只改種類（Instagram 另外把網址收成帳號），字不動、是誰的不動。**
--   不是連結的字（一個名字、一個帳號）看不出是哪裡的，**不動**，驗收表第 4 列寫 LinkedIn 底下還有幾筆這種，要人自己看。
--   email 與電話這兩種不碰（email 是對人用的，電話不會是網址）。
--   搬過去的那一種如果同一個人已經有一模一樣的一筆，掛錯的那一筆直接拿掉（不留兩筆）；如果是別人已經有的，不搬，留在原地（第 3 列寫有幾筆）。
--   每改一筆寫一列 rc_log（contact_kind_fix：改之前與改之後的種類與字）。
--
-- 沒有動的：沒有新的表、沒有新的函式、沒有動 RLS、沒有動任何一道門。誰看得到聯絡方式跟以前一樣（管得了紀錄的人）。
--
-- 要還原：rc_log 裡 what = 'contact_kind_fix' 的每一列，before 是原本的種類與字。
-- ============================================================================

begin;

do $$
declare r record; v_new text; v_hit record; v_moved int := 0; v_dup int := 0; v_taken int := 0;
begin
  for r in
    select i.id, i.person_id, i.kind, i.value,
           case when i.value ~* '\m(facebook\.com|fb\.com|fb\.me)\M' then 'facebook'
                when i.value ~* '\minstagram\.com\M' then 'ig'
                when i.value ~* '\mlinkedin\.com\M' then 'linkedin'
                when i.value ~* '\m(line\.me|lin\.ee)\M' then 'line'
                when i.value ~* '\m(wa\.me|whatsapp\.com)\M' then 'whatsapp'
                when i.value ~* '^\s*(https?://|www\.)' then 'website'
           end as seen
      from public.rc_identities i
     where i.kind in ('linkedin', 'facebook', 'website', 'ig', 'line', 'wechat', 'whatsapp')
     order by i.id
  loop
    if r.seen is null or r.seen = r.kind then continue; end if;
    v_new := public.rc_contact_norm(r.seen, r.value);
    if v_new is null then continue; end if;
    select id, person_id into v_hit from public.rc_identities where kind = r.seen and lower(value) = lower(v_new) and id <> r.id;
    if found then
      if v_hit.person_id = r.person_id then
        -- 同一個人已經有對的那一筆：掛錯的這一筆是多的，拿掉。
        delete from public.rc_identities where id = r.id;
        perform public.rc_log_it('contact_kind_fix', r.person_id, jsonb_build_object('kind', r.kind, 'value', r.value), jsonb_build_object('kind', r.seen, 'value', v_new, 'merged', true));
        v_dup := v_dup + 1;
      else
        -- 別人已經有一模一樣的：不搬（同一個聯絡方式只能屬於一個人），留在原地給人看。
        v_taken := v_taken + 1;
      end if;
      continue;
    end if;
    update public.rc_identities set kind = r.seen, value = v_new where id = r.id;
    perform public.rc_log_it('contact_kind_fix', r.person_id, jsonb_build_object('kind', r.kind, 'value', r.value), jsonb_build_object('kind', r.seen, 'value', v_new));
    v_moved := v_moved + 1;
  end loop;
  raise notice '聯絡方式：改了 % 筆的種類，拿掉 % 筆重複的，% 筆因為別人已經有同一個所以沒動', v_moved, v_dup, v_taken;
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with seen as (
    select i.id, i.person_id, i.kind, i.value,
           case when i.value ~* '\m(facebook\.com|fb\.com|fb\.me)\M' then 'facebook'
                when i.value ~* '\minstagram\.com\M' then 'ig'
                when i.value ~* '\mlinkedin\.com\M' then 'linkedin'
                when i.value ~* '\m(line\.me|lin\.ee)\M' then 'line'
                when i.value ~* '\m(wa\.me|whatsapp\.com)\M' then 'whatsapp'
                when i.value ~* '^\s*(https?://|www\.)' then 'website'
           end as seen
      from public.rc_identities i
     where i.kind in ('linkedin', 'facebook', 'website', 'ig', 'line', 'wechat', 'whatsapp')
  ),
  t as (
    select
      (select count(*)::int from public.rc_log where what = 'contact_kind_fix') as fixed,
      (select coalesce(string_agg(k || ' ' || n, '、' order by n desc), '沒有') from (select after->>'kind' as k, count(*) as n from public.rc_log where what = 'contact_kind_fix' group by 1) z) as fixed_by,
      -- 認得出來、種類卻還是不一樣的：只能是「別人已經有同一個」的那幾筆
      (select count(*)::int from seen s where s.seen is not null and s.seen <> s.kind) as still_wrong,
      (select count(*)::int from seen s where s.seen is not null and s.seen <> s.kind
          and exists (select 1 from public.rc_identities o where o.kind = s.seen and lower(o.value) = lower(public.rc_contact_norm(s.seen, s.value)) and o.person_id <> s.person_id)) as taken,
      (select count(*)::int from seen s where s.kind = 'linkedin' and s.seen is null) as linkedin_plain,
      (select count(*)::int from seen s where s.kind = 'linkedin' and s.seen = 'linkedin') as linkedin_real,
      (select count(*)::int from public.rc_identities where kind = 'ig' and value ~* 'instagram\.com') as ig_urls,
      (select count(*)::int from public.rc_log where what = 'contact_kind_fix' and (before->>'kind' in ('email', 'phone') or after->>'kind' in ('email', 'phone'))) as touched_email_phone,
      (select pg_get_constraintdef(oid) like '%facebook%' and pg_get_constraintdef(oid) like '%website%' from pg_constraint where conname = 'rc_identities_kind_check') as kinds_ok
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when still_wrong = taken and ig_urls = 0 and touched_email_phone = 0 and kinds_ok then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '改過種類的聯絡方式有幾筆（重跑不會再加）', '', fixed::text, 'INFO' from t
  union all select 2, '改成哪幾種', '', fixed_by, 'INFO' from t
  union all select 3, '★ 認得出是哪個網站、種類卻還不對的，只剩「別人已經有同一個」的那幾筆', taken::text, still_wrong::text, case when still_wrong = taken then 'PASS' else 'FAIL' end from t
  union all select 4, 'LinkedIn 底下不是連結的還有幾筆（一個名字或帳號，看不出是哪裡的，要人自己看）', '', linkedin_plain::text, 'INFO' from t
  union all select 5, 'LinkedIn 底下真的是 LinkedIn 連結的有幾筆', '', linkedin_real::text, 'INFO' from t
  union all select 6, '★ Instagram 那一種存的是帳號，沒有整條網址', '0', ig_urls::text, case when ig_urls = 0 then 'PASS' else 'FAIL' end from t
  union all select 7, '★ email 與電話一筆都沒有被改', '0', touched_email_phone::text, case when touched_email_phone = 0 then 'PASS' else 'FAIL' end from t
  union all select 8, '聯絡方式的九種還在（這一支沒有改能存哪幾種）', 'true', coalesce(kinds_ok, false)::text, case when kinds_ok then 'PASS' else 'FAIL' end from t
) x order by ord;
