-- 校友的「我的故事」。　2026-09-11
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。最後印出 PASS / FAIL 表。
-- **先跑 2026-09-17-invite-grants.sql**（校友這個身分是那一支建出來的），
-- 也要先跑過 2026-09-08-students.sql（要用它建的 is_president()）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- 建一張 alumni_stories，一個人一列，放他自己寫的那段故事（中英各四欄），
-- 加上兩支對外讀得到的函式，給 /alumni/ 那一頁用。
--
-- **跑完之後 /alumni/ 上仍然一個真人都沒有**，那是對的：這張表是空的，
-- 而且兩把鑰匙都預設 false。要放誰是之後一個一個決定的事。
--
-- ============================================================================
-- 兩把鑰匙，跟 /team/ 同一套（2026-09-13-public-team.sql）
-- ============================================================================
--   public_story    **本人自己打的勾**。他改得動，別人改不動。
--   story_approved  **P/VP 核可**。只有 president 改得動，本人改不動。
-- 兩個都是 true 才會出現在對外的 /alumni/ 上。
--
-- 為什麼要兩把：只有本人打勾的話，一個高一的幹部可以自己把自己放上去，
-- 而 CLAUDE.md 的紅線是「未成年一律不放」；只有 P/VP 核可的話，
-- 就變成別人替他決定要不要公開自己的臉。**兩件事都要成立。**
--
-- ⚠ **本人用任何路徑都不可以把 story_approved 設成 true。**
-- 不只是 update，**insert 也一樣** —— 下面的 insert 是逐欄授權的，理由寫在那裡。
-- 這兩條路只要漏掉一條，兩把鑰匙就變成一把。
--
-- ⚠ **核可之後改了那段文字會自動下架。** 那段文字是用 BT 的名義公開的，
-- 不重審的話，核可一次之後可以改成任何內容。改名字與城市不觸發。
--
-- ⚠ 系統沒有生日欄位，「未滿 18 不放」技術上擋不住，靠 P/VP 那把鑰匙。
-- 不要為了擋它去收生日 —— 為了一年用兩次的檢查存全體的出生日期，
-- 是拿一個更大的隱私成本換一個小的方便（理由見 2026-09-13-public-team.sql）。
--
-- ⚠ 故事公開到網路上超出現行 /privacy/ 的告知範圍，政策要跟著改，
-- 而且要重新告知每一個人。**名字撤得下來，被搜尋引擎存過的快取撤不乾淨。**
--
-- ============================================================================
-- ⚠ 這張表**不可以**用 PostgREST 的 .upsert()
-- ============================================================================
-- 它是欄位層級授權的表，而 upsert 會把 payload 的每一欄都放進
-- ON CONFLICT DO UPDATE 的 SET 清單，**包含主鍵 id** —— 而 id 不在 update 的
-- 授權清單裡（本人可以 insert 自己那一列，但不可以把一列改成別人的）。
-- Postgres 要求 SET 清單上每一欄都有權限，於是整句被拒，畫面上的症狀是
-- 「存檔按下去完全沒反應」。2026-09-02 availability_meta 就是這樣咬過一次。
-- 前端要存這張表，寫法是「先查有沒有那一列，有就 update、沒有就 insert」。
--
-- ⚠ check.sh 那條「欄位層級授權的表不准用 .upsert()」現在只掃
-- availability/src、app/src、passport/src、reset —— **掃不到 settings/src**，
-- 所以這一條在設定頁上沒有守門看著，只有這則註解。

begin;

-- id 直接當主鍵又當外鍵：一個人最多一個故事。
-- 指到 profiles 不是 auth.users，因為下面每一支函式都要 join profiles 拿 role
-- 與 name_zh，指同一張表少一次間接。on delete cascade 讓 delete_my_account()
-- 那條路（2026-09-08-students.sql 第 7 節）一路把故事也清掉。
create table if not exists public.alumni_stories (
  id             uuid primary key references public.profiles(id) on delete cascade,
  display_name   text,     -- 公開顯示的名字，可以遮字。空的話退回 profiles.name_zh
  school         text,     -- 高中全名
  county         text,     -- 島上的起飛點。只能是那 16 個，見下面的 check
  city           text,     -- 現在在哪個城市
  country        text,     -- 中文國名
  place          text,     -- 現在念哪間學校或在哪裡工作
  quote          text,     -- 他自己的一句話（Iansui 手寫體那一句）
  note           text,     -- 兩三句介紹
  school_en      text,
  country_en     text,
  quote_en       text,
  note_en        text,
  public_story   boolean not null default false,
  story_approved boolean not null default false,
  approved_at    timestamptz,
  updated_at     timestamptz not null default now()
);

comment on table public.alumni_stories is
  '校友（與幹部）自己寫的那段故事，/alumni/ 航線圖的資料來源之一。
   兩把鑰匙：public_story 是本人打的勾，story_approved 是 P/VP 核可，兩個都 true 才對外。';
comment on column public.alumni_stories.public_story is
  '本人同不同意把這段故事放上對外的 /alumni/。**他自己改得動。**';
comment on column public.alumni_stories.story_approved is
  'P/VP 核可。**只有 president 改得動**（走 set_story_approved()）。
   未滿 18 歲一律不核可 —— 系統沒有生日欄位，這一條靠人。';
comment on column public.alumni_stories.county is
  '高中所在的縣市，島上那個起飛點的座標是靠它算的。只能是 cities.json 那 16 個。';

-- 縣市擋在資料庫，因為**填錯的後果特別安靜**：那個人只會不出現在圖上，
-- 沒有任何錯誤訊息、畫面看起來完全正常。
-- 這 16 個要跟 scripts/taiwan/cities.json 一致（前端那一半 check.sh 守著）。
-- 金門與馬祖不在島的資料裡，原因見 scripts/taiwan/README.md。
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'alumni_stories_county_check') then
    alter table public.alumni_stories add constraint alumni_stories_county_check
      check (county is null or county in
        ('台北','新竹','台中','彰化','嘉義','台南','高雄','屏東',
         '花蓮','宜蘭','台東','桃園','苗栗','雲林','南投','基隆'));
  end if;
end $$;

alter table public.alumni_stories enable row level security;

-- ---------- 本人 ----------
-- for all：自己那一列，讀寫都算。**寫得到哪幾欄是下面的 grant 在管**，
-- 不是這條政策 —— RLS 是列層級的，擋不住欄位。
drop policy if exists story_own on public.alumni_stories;
create policy story_own on public.alumni_stories
  for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- Co-President ----------
-- 核可要看內容，所以 president 讀得到全部。**其他幹部一列都看不到** ——
-- 核可是 P/VP 的鑰匙，不是全體幹部的。
--
-- 沒有對應的 update 政策是刻意的：president 也不從這裡改，只走下面那支
-- set_story_approved()。多一條「president 改得動整張表」的政策，
-- 等於多一條沒有人在看的路。
drop policy if exists story_president_read on public.alumni_stories;
create policy story_president_read on public.alumni_stories
  for select to authenticated using (public.is_president());

-- ⚠ **兩條政策都寫了 to authenticated。** 沒寫的話等於對未登入的人也開門
-- （schema.sql 的權限段落講過這件事）。這張表對 anon 是零權限，
-- 對外只走下面那兩支 security definer 的函式。

-- ---------- 權限：先全部收回，再一欄一欄發 ----------
-- **先 revoke 再 grant，順序不能反。** Supabase 對 public schema 的新表預設
-- 把 ALL 發給 anon 與 authenticated，不收回的話下面的 grant 只是裝飾品。
-- （check.sh 有一條守門在數這件事，因為註解擋不住第二次。）
revoke all on public.alumni_stories from anon, authenticated;

grant select on public.alumni_stories to authenticated;

-- ⚠ **insert 也要逐欄授權，這不是對稱的潔癖，是那個洞本身。**
-- 只寫 `grant insert on ... to authenticated` 的話，本人可以直接 insert 一列、
-- 同時把 story_approved 設成 true，而 story_own 那條政策（auth.uid() = id）
-- 會放行 —— 他沒有「改」任何東西，他是「建」了一列已經核可好的。
-- 兩把鑰匙就這樣變成一把，而「未滿 18 一律不放」正是靠另一把擋的。
--
-- 清單跟下面的 update 一樣，多一個 id（要插得進自己那一列）。
-- **story_approved 與 approved_at 兩欄都不在裡面。**
grant insert (id, display_name, school, county, city, country, place, quote, note,
              school_en, country_en, quote_en, note_en, public_story)
  on public.alumni_stories to authenticated;

-- update 少了 id：本人改得動自己那一列的內容，但不可以把那一列改成別人的。
-- **story_approved、approved_at、updated_at 三欄都不在裡面**，
-- 前三欄是核可狀態（跟 profiles.public_approved 同一個做法），
-- updated_at 由資料庫的 trigger 蓋。
grant update (display_name, school, county, city, country, place, quote, note,
              school_en, country_en, quote_en, note_en, public_story)
  on public.alumni_stories to authenticated;

-- ---------- 改了文字就下架 ----------
-- ⚠ **這一支不碰 updated_at。** 那件事交給既有的 public.touch_updated_at()
-- （2026-08-31-profiles-and-role.sql），profiles / forms / resources 三張表
-- 都已經在用它。在這裡再寫一次 new.updated_at := now() 是重複，
-- 而且哪天有人改了通用那一支的行為，這張表會變成唯一一個不一樣的。
--
-- 為什麼分開一支 trigger、不把這段判斷併進 touch_updated_at：
-- 照 2026-09-08-students.sql 第 2 節那段判例 —— 通用那一支每次 update 都要跑，
-- 而這件事只在**那四欄文字改變**的時候才該發生。混在一起的話，
-- 通用那一支的行為就會跟著某一張表的規則走。
--
-- 兩支都是 before update、for each row，執行順序照 trigger 名稱的字母序
-- （alumni_stories_recheck 在 alumni_stories_touch 前面），而這兩件事互不相干。
create or replace function public.recheck_alumni_story()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.quote    is distinct from old.quote
  or new.note     is distinct from old.note
  or new.quote_en is distinct from old.quote_en
  or new.note_en  is distinct from old.note_en then
    new.story_approved := false;
    new.approved_at := null;
  end if;
  return new;
end $$;

-- is distinct from 不是 <>：null 換成字串、字串換成 null 都算改過，
-- 而 <> 對 null 的結果是 null（= 不成立 = 不下架）。
-- 也就是說用 <> 的話，「把已經核可的那一句整句刪掉」不會下架。
--
-- 只看那四欄文字，不看 school / city / place：改城市與換學校是事實更新，
-- 不是換一段用 BT 名義講的話。每改一次地址就要重審一次的話，
-- 沒有人會去更新自己的近況，而那一頁的價值就是近況。
drop trigger if exists alumni_stories_recheck on public.alumni_stories;
create trigger alumni_stories_recheck before update on public.alumni_stories
  for each row execute function public.recheck_alumni_story();

drop trigger if exists alumni_stories_touch on public.alumni_stories;
create trigger alumni_stories_touch before update on public.alumni_stories
  for each row execute function public.touch_updated_at();

-- ---------- P/VP 那一把 ----------
-- 跟 set_public_approved() 同一個形狀與同一組理由（2026-09-13-public-team.sql）。
create or replace function public.set_story_approved(p_target uuid, p_ok boolean)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_president() then
    raise exception 'not_president' using errcode = 'P0001';
  end if;
  -- 學員沒有故事。他被放上校友頁是一個一定會被誤解的狀態
  -- ——那一頁上的人是在說「我走過這條路」。
  update public.alumni_stories s
     set story_approved = p_ok,
         approved_at = case when p_ok then now() else null end
    from public.profiles p
   where s.id = p_target and p.id = s.id and p.role in ('cadre', 'alumni');
  -- 那一列不存在（他還沒寫故事）也走這裡。對按按鈕的人來說兩種情況一樣：
  -- 這個人現在核可不了。
  if not found then raise exception 'not_alumni_or_cadre' using errcode = 'P0001'; end if;
  return p_ok;
end $$;

revoke all on function public.set_story_approved(uuid, boolean) from public, anon;
grant execute on function public.set_story_approved(uuid, boolean) to authenticated;

-- ---------- 對外讀得到的那幾列 ----------
-- **不開放整張表給 anon。** 只有這支函式，只回兩把鑰匙都轉了的那幾列。
--
-- id 回的是 md5(帳號 id)，**不是 uuid**。uuid 是帳號的識別碼，
-- 沒有理由出現在公開頁面的 HTML 裡，而航線圖只需要一個穩定又唯一的 key。
--
-- ⚠ 欄位名**刻意跟 alumni/community.json 的 key 一模一樣**，
-- 前端因此不用寫一層轉換。多一層轉換就多一個會慢慢漂移的地方。
-- 驗收表有一條在比對整串欄位名，改名字會當場變紅。
create or replace function public.public_alumni()
returns table (
  id text, name text, school text, county text, city text, country text, place text,
  quote text, note text, school_en text, country_en text, quote_en text, note_en text
) language sql security definer stable
set search_path = public, pg_temp
as $$
  select md5(s.id::text),
         coalesce(nullif(btrim(s.display_name), ''), p.name_zh, p.name_en),
         s.school, s.county, s.city, s.country, s.place,
         s.quote, s.note, s.school_en, s.country_en, s.quote_en, s.note_en
    from public.alumni_stories s
    join public.profiles p on p.id = s.id
   where s.public_story and s.story_approved
     and p.role in ('cadre', 'alumni')
     and s.county is not null
   order by s.approved_at nulls last, s.updated_at;
$$;

-- county is not null 那一句是刻意的：沒有縣市就算不出島上的起飛點，
-- 那個人會**安靜地不出現在圖上**。與其讓他半出現（名單上有、圖上沒有），
-- 不如整列不回，這樣後台看得到「他還沒填縣市」。

-- 大頭照分開一支。照片是 data URL，一張二十到六十 KB，二十個人就是一 MB
-- 壓在一個對外頁面上，而那一頁的手機分數本來只有 79。
-- 航線圖是「點了才飛、飛到才出卡片」，**照片本來就不必一開始就載**。
--
-- 兩把鑰匙的條件在這裡要再寫一次：少了它，拿著 md5 就能撈到任何一個人的臉。
create or replace function public.public_alumni_avatar(p_key text)
returns text language sql security definer stable
set search_path = public, pg_temp
as $$
  select p.avatar
    from public.alumni_stories s
    join public.profiles p on p.id = s.id
   where md5(s.id::text) = p_key
     and s.public_story and s.story_approved
     and p.role in ('cadre', 'alumni');
$$;

grant execute on function public.public_alumni() to anon, authenticated;
grant execute on function public.public_alumni_avatar(text) to anon, authenticated;

commit;

-- ---------- 驗收 ----------
-- 查 prosrc 的幾條一律先把 SQL 註解剝掉再比對，理由見 2026-09-01-claim-invite.sql：
-- 這個 repo 的註解會解釋規則本身，不剝的話註解會餵飽比對式。
--
-- ⚠ 權限那幾條**不用 information_schema.column_privileges / table_privileges**。
-- 那些檢視只列出「跟目前這個使用者有關」的授權，在 SQL Editor 用某些身分執行時
-- 會安靜地回零列，讓「沒有發給任何人」跟「查不到、所以看起來是沒有」
-- 變成同一個結果 —— **一個因為看不到而通過的安全檢查，比沒有檢查更糟。**
-- 改成直接查系統目錄（pg_class.relacl / pg_attribute.attacl / pg_proc.proacl）。
-- 那三個 acl 是 null 時代表「只有擁有者有權限」，aclexplode(null) 回零列，
-- 那正是我們要的答案，所以這個寫法在兩種情況下都對。
--
-- ⚠ **第 2 條不能省。** 欄位層級的 acl 只記「針對某一欄發出去的授權」；
-- 如果有人改成 `grant update on alumni_stories to authenticated`（整張表），
-- story_approved 的 attacl 仍然是 null，於是第 4、5 條照樣 PASS 而洞是開的。
-- 第 2 條查的是表層級那一份，它才是那兩條成立的前提。
select * from (
  with pa as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc where proname = 'public_alumni'
  ), ss as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc where proname = 'set_story_approved'
  ), rc as (
    select regexp_replace(prosrc, '--[^\n]*', '', 'g') as body
      from pg_proc where proname = 'recheck_alumni_story'
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when
      (select count(*) from pg_class c, aclexplode(c.relacl) x
        where c.oid='public.alumni_stories'::regclass and x.grantee='anon'::regrole) = 0
      and (select count(*) from pg_class c, aclexplode(c.relacl) x
            where c.oid='public.alumni_stories'::regclass
              and x.grantee='authenticated'::regrole and x.privilege_type <> 'SELECT') = 0
      and (select count(*) from pg_class c, aclexplode(c.relacl) x
            where c.oid='public.alumni_stories'::regclass
              and x.grantee='authenticated'::regrole and x.privilege_type = 'SELECT') = 1
      and (select count(*) from pg_attribute a, aclexplode(a.attacl) x
            where a.attrelid='public.alumni_stories'::regclass and a.attname='story_approved'
              and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE') = 0
      and (select count(*) from pg_attribute a, aclexplode(a.attacl) x
            where a.attrelid='public.alumni_stories'::regclass and a.attname='story_approved'
              and x.grantee='authenticated'::regrole and x.privilege_type='INSERT') = 0
      and (select count(*) from pg_attribute a, aclexplode(a.attacl) x
            where a.attrelid='public.alumni_stories'::regclass and a.attname='quote'
              and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE') = 1
      and (select count(*) from pg_attribute a, aclexplode(a.attacl) x
            where a.attrelid='public.alumni_stories'::regclass and a.attname='id'
              and x.grantee='authenticated'::regrole and x.privilege_type='INSERT') = 1
      and (select relrowsecurity from pg_class where oid='public.alumni_stories'::regclass)
      and (select count(*) from pg_policies
            where schemaname='public' and tablename='alumni_stories'
              and policyname='story_own') = 1
      and (select count(*) from pg_policies
            where schemaname='public' and tablename='alumni_stories'
              and policyname='story_president_read' and qual like '%is_president%') = 1
      and (exists (select 1 from pg_trigger
                    where tgrelid='public.alumni_stories'::regclass
                      and tgname='alumni_stories_recheck'))
      and (select body from rc) like '%story_approved%'
      and (select body from rc) like '%quote_en%'
      and (select body from rc) like '%note_en%'
      and (select body from rc) not like '%updated_at%'
      and (select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid
            where t.tgrelid='public.alumni_stories'::regclass
              and t.tgname='alumni_stories_touch' and p.proname='touch_updated_at') = 1
      and (select body from ss) like '%is_president()%'
      and (select body from ss) like '%not_alumni_or_cadre%'
      and (select count(*) from pg_proc p, aclexplode(p.proacl) x
            where p.proname='set_story_approved'
              and x.grantee in (0::regrole, 'anon'::regrole)
              and x.privilege_type='EXECUTE') = 0
      and (select count(*) from pg_proc p, aclexplode(p.proacl) x
            where p.proname='set_story_approved' and x.grantee='authenticated'::regrole
              and x.privilege_type='EXECUTE') = 1
      and (select body from pa) like '%story_approved%'
      and (select body from pa) like '%public_story%'
      and (select body from pa) like '%md5(s.id::text)%'
      and (select array_to_string(proargnames, ',') from pg_proc where proname='public_alumni')
          = 'id,name,school,county,city,country,place,quote,note,school_en,country_en,quote_en,note_en'
      and (select count(*) from pg_proc p, aclexplode(p.proacl) x
            where p.proname in ('public_alumni','public_alumni_avatar')
              and x.grantee='anon'::regrole and x.privilege_type='EXECUTE') = 2
      and (exists (select 1 from pg_constraint where conname='alumni_stories_county_check'))
    then 'PASS' else 'FAIL' end as 結果

  union all select 1, '★ anon 對這張表一種權限都沒有', '0 種',
    (select count(*) from pg_class c, aclexplode(c.relacl) x
      where c.oid='public.alumni_stories'::regclass and x.grantee='anon'::regrole)::text || ' 種',
    case when (select count(*) from pg_class c, aclexplode(c.relacl) x
                where c.oid='public.alumni_stories'::regclass
                  and x.grantee='anon'::regrole) = 0
    then 'PASS' else 'FAIL' end

  -- ★ 這一條是第 4、5 條成立的前提，見上面那段說明。
  union all select 2, '★ authenticated 對整張表只有 SELECT（沒有表層級的 insert/update）', '0 種',
    (select count(*) from pg_class c, aclexplode(c.relacl) x
      where c.oid='public.alumni_stories'::regclass
        and x.grantee='authenticated'::regrole and x.privilege_type <> 'SELECT')::text || ' 種',
    case when (select count(*) from pg_class c, aclexplode(c.relacl) x
                where c.oid='public.alumni_stories'::regclass
                  and x.grantee='authenticated'::regrole and x.privilege_type <> 'SELECT') = 0
    then 'PASS' else 'FAIL' end

  -- ↓ 對照。沒有它，第 1、2 條在「這張表什麼權限都沒發」的時候也會通過，
  --   而那時候整個功能是壞的，不是安全的。
  union all select 3, '【對照】authenticated 讀得到這張表', '1 種',
    (select count(*) from pg_class c, aclexplode(c.relacl) x
      where c.oid='public.alumni_stories'::regclass
        and x.grantee='authenticated'::regrole and x.privilege_type='SELECT')::text || ' 種',
    case when (select count(*) from pg_class c, aclexplode(c.relacl) x
                where c.oid='public.alumni_stories'::regclass
                  and x.grantee='authenticated'::regrole and x.privilege_type='SELECT') = 1
    then 'PASS' else 'FAIL' end

  union all select 4, '★ story_approved 沒有發 UPDATE 給 authenticated', '0 筆',
    (select count(*) from pg_attribute a, aclexplode(a.attacl) x
      where a.attrelid='public.alumni_stories'::regclass and a.attname='story_approved'
        and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE')::text || ' 筆',
    case when (select count(*) from pg_attribute a, aclexplode(a.attacl) x
                where a.attrelid='public.alumni_stories'::regclass and a.attname='story_approved'
                  and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE') = 0
    then 'PASS' else 'FAIL' end

  -- ★ 那個洞本身。本人 insert 一列已經核可好的，RLS 會放行。
  union all select 5, '★ story_approved 也不在 INSERT 權限裡', '0 筆',
    (select count(*) from pg_attribute a, aclexplode(a.attacl) x
      where a.attrelid='public.alumni_stories'::regclass and a.attname='story_approved'
        and x.grantee='authenticated'::regrole and x.privilege_type='INSERT')::text || ' 筆',
    case when (select count(*) from pg_attribute a, aclexplode(a.attacl) x
                where a.attrelid='public.alumni_stories'::regclass and a.attname='story_approved'
                  and x.grantee='authenticated'::regrole and x.privilege_type='INSERT') = 0
    then 'PASS' else 'FAIL' end

  -- ↓ 對照。沒有它，第 4 條在「一欄都沒發」的時候也會通過。
  union all select 6, '【對照】quote 有發 UPDATE 給 authenticated（本人改得動自己的話）', '1 筆',
    (select count(*) from pg_attribute a, aclexplode(a.attacl) x
      where a.attrelid='public.alumni_stories'::regclass and a.attname='quote'
        and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE')::text || ' 筆',
    case when (select count(*) from pg_attribute a, aclexplode(a.attacl) x
                where a.attrelid='public.alumni_stories'::regclass and a.attname='quote'
                  and x.grantee='authenticated'::regrole and x.privilege_type='UPDATE') = 1
    then 'PASS' else 'FAIL' end

  -- ↓ 對照。沒有它，第 5 條在「insert 一欄都沒發」的時候也會通過。
  union all select 7, '【對照】id 有發 INSERT 給 authenticated（本人建得出自己那一列）', '1 筆',
    (select count(*) from pg_attribute a, aclexplode(a.attacl) x
      where a.attrelid='public.alumni_stories'::regclass and a.attname='id'
        and x.grantee='authenticated'::regrole and x.privilege_type='INSERT')::text || ' 筆',
    case when (select count(*) from pg_attribute a, aclexplode(a.attacl) x
                where a.attrelid='public.alumni_stories'::regclass and a.attname='id'
                  and x.grantee='authenticated'::regrole and x.privilege_type='INSERT') = 1
    then 'PASS' else 'FAIL' end

  union all select 8, 'RLS 開著', 'true',
    coalesce((select relrowsecurity::text from pg_class
               where oid='public.alumni_stories'::regclass), '（表不存在）'),
    case when (select relrowsecurity from pg_class where oid='public.alumni_stories'::regclass)
    then 'PASS' else 'FAIL' end

  union all select 9, '本人那條政策在（story_own）', '1 條',
    (select count(*) from pg_policies where schemaname='public'
      and tablename='alumni_stories' and policyname='story_own')::text || ' 條',
    case when (select count(*) from pg_policies where schemaname='public'
                and tablename='alumni_stories' and policyname='story_own') = 1
    then 'PASS' else 'FAIL' end

  -- ★ 讀別人的故事只認 president。改成 is_cadre() 的話，
  --   核可用的那把鑰匙就等於發給全體三十個幹部了。
  union all select 10, '★ 讀別人的故事那條政策問的是 is_president()', '1 條',
    (select count(*) from pg_policies where schemaname='public'
      and tablename='alumni_stories' and policyname='story_president_read'
      and qual like '%is_president%')::text || ' 條',
    case when (select count(*) from pg_policies where schemaname='public'
                and tablename='alumni_stories' and policyname='story_president_read'
                and qual like '%is_president%') = 1
    then 'PASS' else 'FAIL' end

  union all select 11, '★ 改文字下架的 trigger 掛在這張表上', 'true',
    (exists (select 1 from pg_trigger where tgrelid='public.alumni_stories'::regclass
              and tgname='alumni_stories_recheck'))::text,
    case when exists (select 1 from pg_trigger where tgrelid='public.alumni_stories'::regclass
                       and tgname='alumni_stories_recheck')
    then 'PASS' else 'FAIL' end

  -- ★ 光有 trigger 不夠：它要真的看那四欄、真的把核可設回 false。
  --   只留 quote 一欄的話這一條會紅，而第 11 條照樣綠。
  union all select 12, '★ 那支 trigger 看的是四欄文字，而且會把核可設回 false', 'true',
    (select ((body like '%story_approved%') and (body like '%quote_en%')
             and (body like '%note_en%'))::text from rc),
    (select case when (body like '%story_approved%') and (body like '%quote_en%')
                  and (body like '%note_en%') then 'PASS' else 'FAIL' end from rc)

  union all select 13, 'updated_at 用的是既有那支 touch_updated_at', '1 支',
    (select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid
      where t.tgrelid='public.alumni_stories'::regclass
        and t.tgname='alumni_stories_touch' and p.proname='touch_updated_at')::text || ' 支',
    case when (select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid
                where t.tgrelid='public.alumni_stories'::regclass
                  and t.tgname='alumni_stories_touch' and p.proname='touch_updated_at') = 1
    then 'PASS' else 'FAIL' end

  -- ★ 反向：下架那一支**不准**自己再蓋一次 updated_at（2026-09-08 的判例）。
  --   有人把它加回去的話，這張表就會變成唯一一個不跟著通用那支走的表。
  union all select 14, '★ 下架那一支沒有自己再蓋一次 updated_at', 'true',
    (select (body not like '%updated_at%')::text from rc),
    (select case when body not like '%updated_at%' then 'PASS' else 'FAIL' end from rc)

  union all select 15, '★ set_story_approved 先問 is_president()', 'true',
    (select (body like '%is_president()%')::text from ss),
    (select case when body like '%is_president()%' then 'PASS' else 'FAIL' end from ss)

  -- ★ Task 7 的後台認的就是這個錯誤碼。打錯字的話後台會把
  --   「這個人不能被核可」顯示成一個看不懂的資料庫錯誤。
  union all select 16, '★ 只核可 cadre / alumni（丟 not_alumni_or_cadre）', 'true',
    (select (body like '%not_alumni_or_cadre%')::text from ss),
    (select case when body like '%not_alumni_or_cadre%' then 'PASS' else 'FAIL' end from ss)

  union all select 17, 'anon 與 public 叫不動 set_story_approved', '0 筆',
    (select count(*) from pg_proc p, aclexplode(p.proacl) x
      where p.proname='set_story_approved'
        and x.grantee in (0::regrole, 'anon'::regrole)
        and x.privilege_type='EXECUTE')::text || ' 筆',
    case when (select count(*) from pg_proc p, aclexplode(p.proacl) x
                where p.proname='set_story_approved'
                  and x.grantee in (0::regrole, 'anon'::regrole)
                  and x.privilege_type='EXECUTE') = 0
    then 'PASS' else 'FAIL' end

  -- ↓ 對照。沒有它，第 17 條在「函式誰都叫不動」的時候也會通過，
  --   而那時候後台那顆核可按鈕是死的。
  union all select 18, '【對照】authenticated 叫得動 set_story_approved', '1 筆',
    (select count(*) from pg_proc p, aclexplode(p.proacl) x
      where p.proname='set_story_approved' and x.grantee='authenticated'::regrole
        and x.privilege_type='EXECUTE')::text || ' 筆',
    case when (select count(*) from pg_proc p, aclexplode(p.proacl) x
                where p.proname='set_story_approved' and x.grantee='authenticated'::regrole
                  and x.privilege_type='EXECUTE') = 1
    then 'PASS' else 'FAIL' end

  union all select 19, '★ 對外函式只回兩把鑰匙都轉了的列', 'true',
    (select ((body like '%story_approved%') and (body like '%public_story%'))::text from pa),
    (select case when (body like '%story_approved%') and (body like '%public_story%')
                  then 'PASS' else 'FAIL' end from pa)

  union all select 20, '★ 對外函式不回 uuid（回的是 md5）', 'true',
    (select (body like '%md5(s.id::text)%')::text from pa),
    (select case when body like '%md5(s.id::text)%' then 'PASS' else 'FAIL' end from pa)

  -- ★ 這一串欄位名就是 /alumni/ 那一頁的介面。跟 alumni/community.json 的 key
  --   一模一樣，前端因此一行轉換都不用寫。改名字要兩邊一起改。
  union all select 21, '★ 對外函式的欄位名跟 alumni/community.json 一樣',
    'id,name,school,county,city,country,place,quote,note,school_en,country_en,quote_en,note_en',
    coalesce((select array_to_string(proargnames, ',') from pg_proc
               where proname='public_alumni'), '（查不到）'),
    case when (select array_to_string(proargnames, ',') from pg_proc where proname='public_alumni')
            = 'id,name,school,county,city,country,place,quote,note,school_en,country_en,quote_en,note_en'
    then 'PASS' else 'FAIL' end

  union all select 22, '沒登入的人叫得動那兩支對外函式', '2 筆',
    (select count(*) from pg_proc p, aclexplode(p.proacl) x
      where p.proname in ('public_alumni','public_alumni_avatar')
        and x.grantee='anon'::regrole and x.privilege_type='EXECUTE')::text || ' 筆',
    case when (select count(*) from pg_proc p, aclexplode(p.proacl) x
                where p.proname in ('public_alumni','public_alumni_avatar')
                  and x.grantee='anon'::regrole and x.privilege_type='EXECUTE') = 2
    then 'PASS' else 'FAIL' end

  union all select 23, '縣市只能是那 16 個（check constraint）', '有',
    case when exists (select 1 from pg_constraint where conname='alumni_stories_county_check')
         then '有' else '沒有' end,
    case when exists (select 1 from pg_constraint where conname='alumni_stories_county_check')
    then 'PASS' else 'FAIL' end
) x order by ord;

-- ============================================================================
-- 跑完之後
-- ============================================================================
-- /alumni/ 上仍然一個真人都沒有，**那是對的**（這張表是空的）。
-- 要放一個人的流程是：
--   1. 那個人自己到 /settings/ 寫故事、打勾（他同意公開）
--   2. Co-President 到 /admin/ 的核可頁按下去
-- 兩步都做完才會出現。
--
-- ⚠ 核可之前要確認的三件事，寫在 /admin/ 那一頁上，也寫在 README：
--   1. **他滿 18 歲了嗎**（未滿一律不放，不管職位）
--   2. **這段文字可以用 BT 的名義公開嗎**（核可之後他再改就會自動下架，
--      所以核可的是「當下這一版」）
--   3. **隱私政策改了嗎**（故事對外是新用途，現行政策沒有涵蓋）
--
-- 完整的讀寫矩陣在 supabase/rls-test.sql 第 7 節，那裡有真的跑起來的行為測試。
