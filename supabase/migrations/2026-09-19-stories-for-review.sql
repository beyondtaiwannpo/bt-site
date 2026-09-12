-- 後台核可校友故事時看的那一份清單。　2026-09-11
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **先跑 2026-09-18-alumni-stories.sql**（這一支讀它建的 alumni_stories，
-- 而核可本身走它建的 set_story_approved()），也要先跑過 2026-09-08-students.sql
--（要用它建的 is_president()）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- 一支 stories_for_review()，回 /admin/ 的「校友頁」分頁要顯示的每一欄，
-- **只有當屆 Co-President 叫得動**。這張表不建、不改，只讀。
--
-- 跑完之後 /admin/ 的「校友頁」上可能仍然一個人都沒有，那是對的：
-- 它只列**已經自己勾了同意**的人（public_story = true）。
--
-- ============================================================================
-- 為什麼需要這一支：後台拿不到校友的姓名
-- ============================================================================
-- profiles 的讀取政策最後一次定義在 2026-09-13-public-team.sql，它允許三種列：
-- 自己那一列、幹部讀得到**幹部**那幾列、以及兩把鑰匙都轉了的幹部。
-- **校友那一列的 role 是 alumni，不在任何一條裡面。**
--
-- 所以後台如果自己去查 alumni_stories 再查 profiles 補名字，
-- 對每一位沒有填「公開顯示的名字」的校友都會查不到，畫面上顯示「（沒有名字）」——
-- 而那正是他要核可的人。
--
-- 這不只是難看：核可的意思是「這段內容可以用 BT 的名義公開」，
-- 而公開頁上真正會顯示的名字（public_alumni() 會退回 profiles.name_zh），
-- **核可的人在核可當下看不到**。那是核可這道閘失去資訊。
--
-- **不放寬 profiles 的讀取政策。** 那條政策保護的是三十個幹部的資料，
-- 為了後台的一個欄位去鬆動它，是拿一個大的風險換一個小的方便。
-- 改成多這一支 security definer 的函式：一次查詢、名字在資料庫就解析好、
-- 權限集中在一個看得到的地方。
--
-- ============================================================================
-- ⚠ security definer 的函式不受 RLS 保護，門一定要寫在函式本文裡
-- ============================================================================
-- 下面那句 `and public.is_president()` 是這支函式**唯一**的門。
-- 少了它，任何登入的人都讀得到所有人的故事與姓名，**而且 RLS 完全擋不住** ——
-- definer 是以函式擁有者的身分跑的，alumni_stories 上那兩條政策一條都不會被評估。
-- 驗收表第 3 條就是在守這一句。
--
-- ⚠ 這一支回的 id 是**真的 uuid**，跟對外那支 public_alumni() 回 md5 不一樣。
-- 那是刻意的：只有 P/VP 叫得動這一支，而核可要拿這個 id 當
-- set_story_approved(p_target) 的參數。對外那一支的讀者是路人，所以不回 uuid。
--
-- ⚠ 這一支**不做核可**，只給看。按下去那一下走 set_story_approved()，
-- 它自己會再問一次 is_president()。兩支各自檢查，不互相假設。

begin;

-- 欄位名刻意跟 admin/src/ui.js 的 alumniStoriesHTML() 讀的 key 一模一樣，
-- 前端因此不用寫一層轉換。驗收表有一條在比對整串欄位名，改名字會當場變紅。
--
-- where 那三句各守一件事：
--   s.public_story          只列本人自己打過勾的（第一把鑰匙）。**沒打勾的人不該
--                           出現在這份清單上** —— 那會變成一份「還沒有人問過他們」
--                           的名單，而看到名單的人會很想直接核可。
--   p.role in (...)         學員沒有故事。他出現在校友頁上是一個一定會被誤解的狀態。
--   public.is_president()   那道門。見上面。
--
-- order by story_approved：false 排在 true 前面，所以**等核可的在最上面** ——
-- 這一頁的工作就是處理那幾個。同一組裡面最近改過的排前面（改過文字會自動下架，
-- 所以那幾個正是重新回到隊伍裡的人）。
-- ⚠ **多回 approved_at**（總審查 I5，2026-09-11）。touch_updated_at() 是
-- before update 的 trigger，而核可本身也是一句 update，所以按下核可之後
-- updated_at 會被蓋成核可的時間——「內容最後改過：」這句話對**已核可**的人
-- 會說謊，而那正是人在做安全判斷時看的資訊。不改 trigger（那是共用的，
-- 改了會動到這張表以外的行為），改成後台自己分開顯示：未核可的人看
-- 「內容最後改過」（updated_at），已核可的人看「核可於」（approved_at）。
create or replace function public.stories_for_review()
returns table (
  id uuid, name text, school text, county text, city text, country text, place text,
  quote text, note text, public_story boolean, story_approved boolean,
  updated_at timestamptz, approved_at timestamptz
) language sql security definer stable
set search_path = public, pg_temp
as $$
  select s.id,
         coalesce(nullif(btrim(s.display_name), ''), p.name_zh, p.name_en, '（沒有名字）'),
         s.school, s.county, s.city, s.country, s.place,
         s.quote, s.note, s.public_story, s.story_approved, s.updated_at, s.approved_at
    from public.alumni_stories s
    join public.profiles p on p.id = s.id
   where s.public_story
     and p.role in ('cadre', 'alumni')
     and public.is_president()
   order by s.story_approved, s.updated_at desc;
$$;

comment on function public.stories_for_review() is
  '/admin/ 校友頁那份核可清單。只有 Co-President 叫得動（門寫在函式本文裡的
   is_president()，因為 security definer 不受 RLS 保護）。
   只回已經勾了同意的幹部與校友，名字在這裡就解析好（profiles 的讀取政策
   不涵蓋校友那幾列，後台自己查會查不到）。';

-- 先收回再發，跟這個 repo 每一支函式同一個順序。
revoke all on function public.stories_for_review() from public, anon;
grant execute on function public.stories_for_review() to authenticated;

commit;

-- ---------- 驗收 ----------
-- 查 prosrc 的幾條一律先把 SQL 註解剝掉再比對，理由見 2026-09-01-claim-invite.sql：
-- 這個 repo 的註解會解釋規則本身，不剝的話註解會餵飽比對式。
--
-- ⚠ 權限那兩條**不用 information_schema.routine_privileges**。那些檢視只列出
-- 「跟目前這個使用者有關」的授權，在 SQL Editor 用某些身分執行時會安靜地回零列，
-- 讓「沒有發給任何人」跟「查不到、所以看起來是沒有」變成同一個結果 ——
-- **一個因為看不到而通過的安全檢查，比沒有檢查更糟。**
-- 改成直接查 pg_proc.proacl；它是 null 時代表「只有擁有者有權限」，
-- aclexplode(null) 回零列，那正是我們要的答案，所以兩種情況下都對。
--
-- ⚠ 每一條都要能回答「改壞了會不會翻紅」。所以比對式錨定的是**只有那一句話
-- 才寫得出來的字面**，不是一個在別處也出現的字：
--   第 4 條找的是 `where s.public_story` 而不是 `public_story` ——
--   後者在 select 清單裡本來就有，拿掉整句 where 它照樣是綠的。
--   第 5 條找的是帶引號的 'cadre' 而不是 alumni —— 後者是表名的一部分
--   （public.alumni_stories），拿掉 role 那一句它照樣是綠的。
select * from (
  with sr as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body,
           prosecdef, proconfig, proargnames
      from pg_proc where proname = 'stories_for_review'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when
      (select count(*) from sr) = 1
      and (select prosecdef from sr)
      and coalesce((select array_to_string(proconfig, ',') from sr), '') like '%search_path=%public%'
      and (select body from sr) like '%and public.is_president()%'
      and (select body from sr) like '%where s.public_story%'
      and (select body from sr) like '%''cadre''%'
      and (select body from sr) like '%name_zh%'
      and (select body from sr) like '%order by s.story_approved%'
      and (select array_to_string(proargnames, ',') from sr)
          = 'id,name,school,county,city,country,place,quote,note,public_story,story_approved,updated_at,approved_at'
      and (select count(*) from pg_proc p, aclexplode(p.proacl) x
            where p.proname='stories_for_review'
              and x.grantee in (0::regrole, 'anon'::regrole)
              and x.privilege_type='EXECUTE') = 0
      and (select count(*) from pg_proc p, aclexplode(p.proacl) x
            where p.proname='stories_for_review' and x.grantee='authenticated'::regrole
              and x.privilege_type='EXECUTE') = 1
      and (select count(*) from pg_proc
            where proname in ('is_president', 'set_story_approved')) = 2
    then 'PASS' else 'FAIL' end as 結果

  union all select 1, '★ 函式在，而且是 security definer', 'true',
    coalesce((select prosecdef::text from sr), '（函式不存在）'),
    case when (select prosecdef from sr) then 'PASS' else 'FAIL' end

  -- ★ 沒釘 search_path 的 definer 函式，可以被同名的暫存表換掉它讀的東西。
  union all select 2, '★ search_path 釘死了', '含 search_path=public',
    coalesce((select array_to_string(proconfig, ',') from sr), '（沒有釘）'),
    case when coalesce((select array_to_string(proconfig, ',') from sr), '')
              like '%search_path=%public%'
    then 'PASS' else 'FAIL' end

  -- ★ **這一條是整支檔案最重要的一條。** definer 不受 RLS 保護，
  --   少了本文裡這一句，任何登入的人都讀得到所有人的故事與姓名。
  --
  -- ⚠ 錨點連 `and` 一起比對，**不是只找 is_president()**：
  --   把 `and public.is_president()` 改成 `or public.is_president()`，
  --   門就整個開了（那一句對每一列都成立，where 等於沒有過濾），
  --   而只比對函式名的話這一條跟 OVERALL 都還是綠的。一個字的成本。
  union all select 3, '★ 本文裡真的有 and public.is_president()（這是唯一的門）', 'true',
    coalesce((select (body like '%and public.is_president()%')::text from sr), '（查不到）'),
    coalesce((select case when body like '%and public.is_president()%' then 'PASS' end from sr), 'FAIL')

  -- ★ 沒打勾的人不准出現在核可清單上。
  union all select 4, '★ 只回本人自己打了勾的那幾列（where s.public_story）', 'true',
    coalesce((select (body like '%where s.public_story%')::text from sr), '（查不到）'),
    coalesce((select case when body like '%where s.public_story%' then 'PASS' end from sr), 'FAIL')

  -- ★ 學員沒有故事。他出現在校友頁上是一個一定會被誤解的狀態。
  union all select 5, '★ 只回幹部與校友（本文裡有 ''cadre''）', 'true',
    coalesce((select (body like '%''cadre''%')::text from sr), '（查不到）'),
    coalesce((select case when body like '%''cadre''%' then 'PASS' end from sr), 'FAIL')

  -- ★ 這一支存在的理由本身：名字在資料庫解析好。少了它，後台對每一位校友
  --   都會顯示「（沒有名字）」，而那正是要被核可的人。
  union all select 6, '★ 名字在函式裡就解析好（退得回 profiles.name_zh）', 'true',
    coalesce((select (body like '%name_zh%')::text from sr), '（查不到）'),
    coalesce((select case when body like '%name_zh%' then 'PASS' end from sr), 'FAIL')

  union all select 7, '★ 等核可的排在最上面（order by s.story_approved）', 'true',
    coalesce((select (body like '%order by s.story_approved%')::text from sr), '（查不到）'),
    coalesce((select case when body like '%order by s.story_approved%' then 'PASS' end from sr), 'FAIL')

  -- ★ 這一串欄位名就是後台那一頁的介面（admin/src/ui.js 的 alumniStoriesHTML）。
  --   改名字要兩邊一起改，不然畫面上會出現一排空白，而且不會有任何錯誤。
  union all select 8, '★ 回傳的欄位名跟後台讀的 key 一樣',
    'id,name,school,county,city,country,place,quote,note,public_story,story_approved,updated_at,approved_at',
    coalesce((select array_to_string(proargnames, ',') from sr), '（查不到）'),
    case when (select array_to_string(proargnames, ',') from sr)
            = 'id,name,school,county,city,country,place,quote,note,public_story,story_approved,updated_at,approved_at'
    then 'PASS' else 'FAIL' end

  union all select 9, '★ 沒登入的人叫不動這一支', '0 筆',
    (select count(*) from pg_proc p, aclexplode(p.proacl) x
      where p.proname='stories_for_review'
        and x.grantee in (0::regrole, 'anon'::regrole)
        and x.privilege_type='EXECUTE')::text || ' 筆',
    case when (select count(*) from pg_proc p, aclexplode(p.proacl) x
                where p.proname='stories_for_review'
                  and x.grantee in (0::regrole, 'anon'::regrole)
                  and x.privilege_type='EXECUTE') = 0
    then 'PASS' else 'FAIL' end

  -- ↓ 對照。沒有它，第 9 條在「這支函式誰都叫不動」的時候也會通過，
  --   而那時候後台那一頁是空的，不是安全的。
  union all select 10, '【對照】authenticated 叫得動這一支', '1 筆',
    (select count(*) from pg_proc p, aclexplode(p.proacl) x
      where p.proname='stories_for_review' and x.grantee='authenticated'::regrole
        and x.privilege_type='EXECUTE')::text || ' 筆',
    case when (select count(*) from pg_proc p, aclexplode(p.proacl) x
                where p.proname='stories_for_review' and x.grantee='authenticated'::regrole
                  and x.privilege_type='EXECUTE') = 1
    then 'PASS' else 'FAIL' end

  -- 相依。跑錯順序的話這一條會紅，而症狀（畫面上的核可按鈕按下去沒反應）
  -- 離原因很遠，所以在這裡先問一次。
  union all select 11, '相依：is_president() 與 set_story_approved() 都在', '2 支',
    (select count(*) from pg_proc
      where proname in ('is_president', 'set_story_approved'))::text || ' 支',
    case when (select count(*) from pg_proc
                where proname in ('is_president', 'set_story_approved')) = 2
    then 'PASS' else 'FAIL' end
) x order by ord;

-- ============================================================================
-- 跑完之後
-- ============================================================================
-- 到 /admin/ 用 Co-President 的帳號按「校友頁」那個分頁。
-- 看得到的應該是**已經勾了同意**的幹部與校友，等核可的排在最上面。
-- 一個人都沒有是正常的（還沒有人勾）。
--
-- ⚠ 用一個**不是 Co-President** 的幹部帳號登入，那個分頁不該出現；
-- 就算有人自己去呼叫這支函式，也應該回零列（門在函式本文裡）。
-- 這件事這份驗收表驗不到 —— 它讀的是目錄，不是行為。
-- 真的跑起來的讀寫矩陣在 supabase/rls-test.sql。
