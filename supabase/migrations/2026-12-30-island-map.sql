-- BT 島的島、在做的事、協作線搬進資料庫　2026-11-17（Paul：「Yes, move them」）
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑（seed 用 on conflict do nothing，後台改過的字不會被蓋掉）。最後印一張 PASS / FAIL 表。
-- 要先跑過 2026-12-29-island-posts.sql（這一支用同一個 can_edit_island_post(team) 的門）。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
-- /island/ 之前是讀 repo 裡的 island/teams.json：每座島的說明、島上每一棟（在做的事）、島跟島的協作線。不會寫程式的人改不了。
-- 這一支把那三樣搬進三張表，後台 /admin/site/#island-map 可以改；島先讀 public_island()，讀不到才退回 teams.json。
--   1. island_teams：八座島（id 固定，跟 island/src/layout.js 的位置對應；後台不加減島，只改字與樣子）。
--   2. island_programs：每一棟。id 是代號（貼文掛的就是它），team_id 是哪座島，kind 畫成什麼。
--   3. island_connections：a、b 兩座島加一句為什麼。
--   4. 誰能改：那座島的 team「改」以上、Marketing「管」、senior（can_edit_island_post(team)，2026-12-29 那支建的）；協作線與聚會所只有後兩種。
--   5. 對外：public_island() 回 { teams: [...含 programs], connections: [...] }，anon 叫得到；表本身不開給 anon。
--   6. seed：把 2026-11-17 的 teams.json 那一份灌進去。
-- ============================================================================

begin;

create table if not exists public.island_teams (
  id          text primary key check (id in ('commons', 'sponsorship', 'curriculum', 'internship', 'mentorship', 'marketing', 'cr', 'airport')),
  name_zh     text not null default '',
  name_en     text not null default '',
  tagline_zh  text not null default '',
  tagline_en  text not null default '',
  about_zh    text not null default '',
  about_en    text not null default '',
  colour      text not null default 'teal' check (colour in ('orange', 'teal', 'navy', 'yellow', 'sand', 'cream', 'grey')),
  lead        text not null default '' check (lead in ('', 'a', 'b')),
  sea         boolean not null default false,
  ground      text not null default 'grass' check (ground in ('grass', 'lawn', 'patch', 'tiles', 'grid', 'paving', 'checker', 'brick')),
  scenery     text not null default '' check (scenery in ('', 'playground', 'plaza', 'classroom', 'school', 'garden', 'studio', 'square')),
  trees       int not null default 10 check (trees between 0 and 20),
  workspace   text not null default '',
  updated_at  timestamptz not null default now()
);
create table if not exists public.island_programs (
  id          text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  team_id     text not null references public.island_teams(id) on delete cascade,
  kind        text not null default 'hall' check (kind in ('hall', 'tent', 'booth', 'desk', 'home', 'post', 'pier', 'tower', 'airport', 'camp', 'school', 'studio', 'stage')),
  name_zh     text not null default '',
  name_en     text not null default '',
  line_zh     text not null default '',
  line_en     text not null default '',
  detail_zh   text not null default '',
  detail_en   text not null default '',
  link        text not null default '' check (link = '' or link ~ '^(\.\./|https://)'),
  sort        int not null default 100,
  updated_at  timestamptz not null default now()
);
create table if not exists public.island_connections (
  id          uuid primary key default gen_random_uuid(),
  a           text not null references public.island_teams(id) on delete cascade,
  b           text not null references public.island_teams(id) on delete cascade,
  why_zh      text not null default '',
  why_en      text not null default '',
  unique (a, b),
  check (a <> b)
);
alter table public.island_teams enable row level security;
alter table public.island_programs enable row level security;
alter table public.island_connections enable row level security;
revoke all on public.island_teams, public.island_programs, public.island_connections from anon, authenticated;
grant select on public.island_teams, public.island_programs, public.island_connections to authenticated;
drop policy if exists island_teams_read on public.island_teams;
create policy island_teams_read on public.island_teams for select to authenticated using (public.is_cadre());
drop policy if exists island_programs_read on public.island_programs;
create policy island_programs_read on public.island_programs for select to authenticated using (public.is_cadre());
drop policy if exists island_connections_read on public.island_connections;
create policy island_connections_read on public.island_connections for select to authenticated using (public.is_cadre());
drop trigger if exists island_teams_touch on public.island_teams;
create trigger island_teams_touch before update on public.island_teams for each row execute function public.touch_updated_at();
drop trigger if exists island_programs_touch on public.island_programs;
create trigger island_programs_touch before update on public.island_programs for each row execute function public.touch_updated_at();

-- ---------- 誰能改哪座島：照那座島的 workspace 問 can_edit_island_post ----------
create or replace function public.can_edit_island_team(p_team_id text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select public.can_edit_island_post((select t.workspace from island_teams t where t.id = p_team_id)); $$;
revoke all on function public.can_edit_island_team(text) from public;
grant execute on function public.can_edit_island_team(text) to anon, authenticated;

-- 改一座島的字與樣子（不加減島、不改 id、不改 workspace）。
create or replace function public.upsert_island_team(p_patch jsonb)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id text := p_patch->>'id';
begin
  if not exists (select 1 from island_teams where id = v_id) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not public.can_edit_island_team(v_id) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  update public.island_teams set
    name_zh    = coalesce(p_patch->>'name_zh', name_zh),       name_en    = coalesce(p_patch->>'name_en', name_en),
    tagline_zh = coalesce(p_patch->>'tagline_zh', tagline_zh), tagline_en = coalesce(p_patch->>'tagline_en', tagline_en),
    about_zh   = coalesce(p_patch->>'about_zh', about_zh),     about_en   = coalesce(p_patch->>'about_en', about_en),
    colour     = coalesce(p_patch->>'colour', colour),         ground     = coalesce(p_patch->>'ground', ground),
    scenery    = coalesce(p_patch->>'scenery', scenery),       trees      = coalesce((p_patch->>'trees')::int, trees)
  where id = v_id;
  return v_id;
end $$;
revoke all on function public.upsert_island_team(jsonb) from public, anon;
grant execute on function public.upsert_island_team(jsonb) to authenticated;

-- 新增或改一棟。新增要給 id（代號）與 team_id；改的話只收它認得的欄位。搬到別座島兩邊都要有權。
create or replace function public.upsert_island_program(p_patch jsonb)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id text := p_patch->>'id'; v_old record; v_team text := p_patch->>'team_id';
begin
  if coalesce(v_id, '') !~ '^[a-z0-9-]{2,40}$' then raise exception 'bad_slug' using errcode = 'P0001'; end if;
  select * into v_old from public.island_programs where id = v_id;
  if not found then
    if v_team is null or not exists (select 1 from island_teams where id = v_team) then raise exception 'bad_team' using errcode = 'P0001'; end if;
    if not public.can_edit_island_team(v_team) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
    if coalesce(p_patch->>'link', '') <> '' and p_patch->>'link' !~ '^(\.\./|https://)' then raise exception 'bad_link' using errcode = 'P0001'; end if;
    insert into public.island_programs (id, team_id, kind, name_zh, name_en, line_zh, line_en, detail_zh, detail_en, link, sort)
    values (v_id, v_team, coalesce(nullif(p_patch->>'kind', ''), 'hall'), coalesce(p_patch->>'name_zh', ''), coalesce(p_patch->>'name_en', ''),
            coalesce(p_patch->>'line_zh', ''), coalesce(p_patch->>'line_en', ''), coalesce(p_patch->>'detail_zh', ''), coalesce(p_patch->>'detail_en', ''),
            coalesce(p_patch->>'link', ''), coalesce((p_patch->>'sort')::int, 100));
    return v_id;
  end if;
  if not public.can_edit_island_team(v_old.team_id) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if v_team is not null and v_team <> v_old.team_id and not public.can_edit_island_team(v_team) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if p_patch ? 'link' and coalesce(p_patch->>'link', '') <> '' and p_patch->>'link' !~ '^(\.\./|https://)' then raise exception 'bad_link' using errcode = 'P0001'; end if;
  update public.island_programs set
    team_id   = coalesce(v_team, team_id),
    kind      = coalesce(nullif(p_patch->>'kind', ''), kind),
    name_zh   = coalesce(p_patch->>'name_zh', name_zh),     name_en   = coalesce(p_patch->>'name_en', name_en),
    line_zh   = coalesce(p_patch->>'line_zh', line_zh),     line_en   = coalesce(p_patch->>'line_en', line_en),
    detail_zh = coalesce(p_patch->>'detail_zh', detail_zh), detail_en = coalesce(p_patch->>'detail_en', detail_en),
    link      = coalesce(p_patch->>'link', link),           sort      = coalesce((p_patch->>'sort')::int, sort)
  where id = v_id;
  return v_id;
end $$;
revoke all on function public.upsert_island_program(jsonb) from public, anon;
grant execute on function public.upsert_island_program(jsonb) to authenticated;

create or replace function public.delete_island_program(p_id text)
returns text language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v record;
begin
  select * into v from public.island_programs where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not public.can_edit_island_team(v.team_id) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if exists (select 1 from island_teams t where t.id = v.team_id) and (select count(*) from island_programs x where x.team_id = v.team_id) <= 1 then raise exception 'last_program' using errcode = 'P0001'; end if;
  delete from public.island_programs where id = p_id;
  return p_id;
end $$;
revoke all on function public.delete_island_program(text) from public, anon;
grant execute on function public.delete_island_program(text) to authenticated;

-- 協作線：只有 Marketing「管」與 senior（跨兩個 team 的事）。
create or replace function public.upsert_island_connection(p_patch jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid := nullif(p_patch->>'id', '')::uuid; v_a text := p_patch->>'a'; v_b text := p_patch->>'b';
begin
  if not public.can_edit_island_post('') then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if v_id is null then
    if v_a is null or v_b is null or v_a = v_b or not exists (select 1 from island_teams where id = v_a) or not exists (select 1 from island_teams where id = v_b) then raise exception 'bad_team' using errcode = 'P0001'; end if;
    insert into public.island_connections (a, b, why_zh, why_en) values (v_a, v_b, coalesce(p_patch->>'why_zh', ''), coalesce(p_patch->>'why_en', ''))
    on conflict (a, b) do update set why_zh = excluded.why_zh, why_en = excluded.why_en returning id into v_id;
    return v_id;
  end if;
  update public.island_connections set why_zh = coalesce(p_patch->>'why_zh', why_zh), why_en = coalesce(p_patch->>'why_en', why_en) where id = v_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  return v_id;
end $$;
revoke all on function public.upsert_island_connection(jsonb) from public, anon;
grant execute on function public.upsert_island_connection(jsonb) to authenticated;

create or replace function public.delete_island_connection(p_id uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_edit_island_post('') then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  delete from public.island_connections where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  return true;
end $$;
revoke all on function public.delete_island_connection(uuid) from public, anon;
grant execute on function public.delete_island_connection(uuid) to authenticated;

-- 對外：島讀這一支。形狀跟 island/teams.json 一樣（people 不在這裡，島自己接 public_team()）。
create or replace function public.public_island()
returns jsonb language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name_zh', t.name_zh, 'name_en', t.name_en, 'tagline_zh', t.tagline_zh, 'tagline_en', t.tagline_en,
        'about_zh', t.about_zh, 'about_en', t.about_en, 'colour', t.colour, 'lead', t.lead, 'sea', t.sea,
        'ground', t.ground, 'scenery', t.scenery, 'trees', t.trees, 'workspace', t.workspace,
        'programs', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'name_zh', p.name_zh, 'name_en', p.name_en,
            'line_zh', p.line_zh, 'line_en', p.line_en, 'detail_zh', p.detail_zh, 'detail_en', p.detail_en, 'link', p.link) order by p.sort, p.id)
            from island_programs p where p.team_id = t.id), '[]'::jsonb)
      ) order by t.id) from island_teams t), '[]'::jsonb),
    'connections', coalesce((select jsonb_agg(jsonb_build_object('a', c.a, 'b', c.b, 'why_zh', c.why_zh, 'why_en', c.why_en)) from island_connections c), '[]'::jsonb)
  );
$$;
revoke all on function public.public_island() from public;
grant execute on function public.public_island() to anon, authenticated;

-- ---------- seed：2026-11-17 的 teams.json ----------
insert into public.island_teams (id, name_zh, name_en, tagline_zh, tagline_en, about_zh, about_en, colour, lead, sea, ground, scenery, trees, workspace) values
  ('commons', '聚會所', 'The Commons', '大家都會來的地方。', 'Where everyone comes.', '中間這座不屬於任何一個 team。全員會議、retreat、換屆交接都在這裡，每座島上的人都會走過來。兩位 Co-President 也各自住在自己的 team 的島上，不住這裡。', 'The island in the middle belongs to no team. All-hands meetings, the retreat and the handover happen here, and people from every island walk over. The two Co-Presidents live on their own team''s island, not here.', 'cream', '', false, 'patch', 'playground', 8, ''),
  ('sponsorship', 'Sponsorship', 'Sponsorship', '贊助與合作。讓這一切對學員維持 0 元。', 'Partnerships and funding. Keeps everything free for students.', '找願意一起做這件事的個人、企業與學校。嘖嘖募資也在這裡：2027 年 3 月 23 日上線，4 月 21 日結束。', 'Finds the people, companies and schools willing to build this with us. The Zeczec crowdfunding campaign lives here too: live 23 March 2027, closes 21 April 2027.', 'orange', 'a', false, 'paving', 'plaza', 12, 'Sponsorship Team'),
  ('curriculum', 'Curriculum', 'Curriculum', '活動內容。探索營的每一堂課都是這裡排的。', 'Programme content. Every bootcamp class is scheduled here.', '探索營、講座、海外大學資料庫。學員看到的每一份教材、每一個講者，都是這個 team 找來的。', 'The bootcamp, the talks, the college database. Every handout a student sees and every speaker they meet was arranged by this team.', 'teal', 'a', false, 'tiles', 'classroom', 13, 'Curriculum Team'),
  ('internship', 'Internship', 'Internship', '實習。履歷上有真的做過的事。', 'Internships. Real work on a real CV.', '高中生實習計劃：讓公立高中生在申請之前就有一段真的做過的事。實習生有自己的一本護照。', 'The high school internship programme gives public school students real work experience before they apply. Interns have a passport of their own.', 'yellow', 'a', false, 'grid', 'school', 9, 'Internship Team'),
  ('mentorship', 'Mentorship', 'Mentorship', '導生配對。配一位走過同一條路的學長姐。', 'Matching and mentoring. One alumnus who has walked the same road.', '一學期配對一次，每年約 50 對。不幫寫 essay，陪學生把卡住的地方講清楚。有些配對超過兩年還在聯絡。', 'One matching round a semester, about 50 pairs a year. Mentors do not write essays; they help students say what they are stuck on. Some pairs are still in touch two years on.', 'teal', 'b', false, 'lawn', 'garden', 16, 'Mentorship Team'),
  ('marketing', 'Marketing', 'Marketing', '對外的內容與視覺。', 'Everything we say and show publicly.', 'Instagram、大學介紹系列、官網的照片與影片。活動公告以 Instagram 為第一管道。', 'Instagram, the college introduction series, the photos and video on this site. Instagram is the first channel for every announcement.', 'orange', 'b', false, 'checker', 'studio', 12, 'Marketing Team'),
  ('cr', 'Community Relations', 'Community Relations', '社群關係。走進公立高中，也顧著學校與社群的關係。', 'Community relations. Into public high schools, and the ties with schools and the wider community.', '安排學長姐回公立高中演講，讓資訊到達本來到不了的地方；校園大使把消息帶進自己的學校。2021 年十月第一批校園大使 18 位。', 'Arranges alumni talks at public high schools so the information reaches places it never did; campus ambassadors carry the news into their own schools. The first 18 ambassadors started in October 2021.', 'yellow', 'b', false, 'brick', 'square', 14, 'Community Relations Team'),
  ('airport', '機場', 'Airport', '回來的人從這裡上島。', 'People who come back land here.', '海上的一座機場，不是島。校友回來當講者、當 mentor、來 retreat，學員來探索營，都從這裡上岸，走橋到他們要去的那座島。跑道的另一頭接著歷史之路：BT 怎麼走過來。', 'An airport on the sea, not an island. Alumni coming back to speak, to mentor or for the retreat, and students coming to the bootcamp, all land here and walk the bridges to the island they are heading for. The far end of the runway leads to Our Road: how BT got here.', 'navy', '', true, 'grass', '', 0, '')
on conflict (id) do nothing;

insert into public.island_programs (id, team_id, kind, name_zh, name_en, line_zh, line_en, detail_zh, detail_en, link, sort) values
  ('meeting', 'commons', 'hall', '全員會議', 'All-hands', '六個 team 的人在同一個時間看板上找得到彼此。', 'Six teams find each other on one shared time board.', '幹部分布七個國家、好幾個時區。每週時間看板讓大家填自己有空的時間，會議才排得出來。', 'Organisers are spread across seven countries and several time zones. A weekly time board lets everyone mark when they are free, so meetings can be scheduled at all.', '../about/', 10),
  ('retreat', 'commons', 'camp', 'Retreat', 'Retreat', '一年一次，所有人在同一個地方。', 'Once a year, everyone in the same place.', '校友、學員、幹部都可以來。這一屆走過的事在護照上蓋了章，retreat 的時候拿出來看。', 'Alumni, students and organisers all come. What this year''s group has done is stamped in the passport, and the retreat is when it comes out.', '../about/', 20),
  ('term', 'commons', 'tower', '這一屆與交接', 'This year and the handover', '2026 年 8 月到 2027 年 7 月，然後交給下一屆。', 'August 2026 to July 2027, then it passes on.', 'BT 每年換一批幹部。護照、看板、後台、這個網站，都是為了交接做的工具：讓一位沒寫過程式的新任幹部自己接得起來。', 'A new group takes over every year. The passport, the time board, the admin area and this site are all handover tools, built so a new organiser who has never written code can take over.', '../history/', 30),
  ('zeczec', 'sponsorship', 'pier', '嘖嘖募資 2027', 'Zeczec campaign 2027', '一個 30 天的回饋型專案。', 'A 30-day reward-based campaign.', '2027 年 1 月 26 日搶先看、3 月 23 日上線、4 月 21 日結束。募得越多，學生拿到的免費資源越多。贊助者主要是家長與校友。', 'Early look 26 January 2027, live 23 March, closes 21 April. The more it raises, the more free resources students get. Backers are mostly parents and alumni.', '../stories/', 10),
  ('partners', 'sponsorship', 'hall', '企業與學校合作', 'Partners', '美國在臺協會、EducationUSA、北一女、好伴 café。', 'AIT, EducationUSA, Taipei First Girls High School, TRÈS BON café.', '合作單位提供場地、講者與資源。想一起做這件事的單位，從官網的合作頁找我們。', 'Partners provide venues, speakers and resources. Organisations that want to work with us start on the partner page.', '../partner/', 20),
  ('bootcamp', 'curriculum', 'tent', '探索營 College Bootcamp', 'College Bootcamp', '每年寒暑假各一場，兩天，免費。', 'Twice a year, winter and summer. Two days. Free.', '學員看學長姐當年真正送出去的申請文書、改自己的，再跟五、六位不同科系的人聊國外的實際生活。第一屆在 2023 年六月，超過 80 位高中生參加。', 'Students read the essays alumni actually submitted, rewrite one of their own, and talk with five or six people studying different subjects. The first one ran in June 2023 with more than 80 students.', '../programs/', 10),
  ('talks', 'curriculum', 'hall', '講座', 'Talks', '不定期，免費，Instagram 先公布。', 'Through the year, free, announced on Instagram first.', '2021 年六月的線上博覽會有超過 400 人參加。場次都先在 Instagram 公布。', 'The June 2021 online fair drew more than 400 people. Dates are always announced on Instagram first.', '../events/', 20),
  ('database', 'curriculum', 'desk', '海外大學資料庫', 'College database', '112 所學校，七張表，免費公開。', '112 schools, seven tables, free and public.', '放在 Notion，任何人都看得到。每年查驗一次官網連結與門檻。', 'Hosted on Notion, open to anyone. Links and requirements are re-verified once a year.', '../resources/', 30),
  ('hs-internship', 'internship', 'school', '高中生實習計劃', 'High school internship', '每學期收一批，從官網報名。', 'One intake a semester, apply on the site.', '實習生進 BT 的各個 team 做真的事，有自己的實習護照記錄做過什麼。', 'Interns join BT''s teams and do real work, tracked in their own intern passport.', '../apply/', 10),
  ('mentoring', 'mentorship', 'home', '導生配對計畫', 'Mentorship Program', '一學期配對一次，免費。', 'One round a semester. Free.', '從 2020 年九月開始，第一批 36 人。2020 年至今超過 250 位學員在申請路上有人可以問。', 'Started September 2020 with 36 students. Since 2020, more than 250 students have had someone to ask.', '../programs/', 10),
  ('alumni', 'mentorship', 'pier', '校友回來', 'Alumni come back', '超過 20 位校友回來當講者。', 'More than 20 alumni have come back to speak.', '校友自己在設定頁填故事、自己勾同意，就出現在官網的 Alumni 航線圖上。', 'Alumni write their own story in settings, give consent themselves, and appear on the Alumni route map.', '../alumni/', 20),
  ('instagram', 'marketing', 'studio', 'Instagram @beyondtaiwan', 'Instagram @beyondtaiwan', '每一場活動都先在這裡公布。', 'Every event is announced here first.', '大學介紹貼文從後台做：Marketing 寫、Co-President 核可、排程發出。', 'College introduction posts are made in the admin area: Marketing writes, a Co-President approves, then they go out on schedule.', 'https://www.instagram.com/beyondtaiwan', 10),
  ('site', 'marketing', 'desk', '官網', 'This website', '一個資料夾一頁，零建置。', 'One folder per page, no build step.', '首頁的島、Alumni 航線圖、歷史之路，到這座島，都是為了讓下一屆接得起來做的。', 'The home page island, the Alumni route map, Our Road and this island are all built so the next group can take over.', '../', 20),
  ('school-talks', 'cr', 'stage', '校園講座', 'School talks', '學長姐回自己的高中講怎麼申請。', 'Alumni go back to their own high schools to explain how they applied.', '講完把 BT 的 Instagram 留在黑板上。很多學員第一次聽到這條路就是在這一場。', 'They leave BT''s Instagram on the board. For many students this talk is the first time they hear the road exists.', '../impact/', 10),
  ('ambassadors', 'cr', 'post', '校園大使', 'Campus ambassadors', '在校的高中生，幫 BT 把消息帶進學校。', 'High school students who carry the news into their schools.', '2021 年十月第一批 18 位。', 'The first 18 started in October 2021.', '../join/', 20),
  ('road', 'airport', 'airport', '走那條路', 'Walk the road', '從七個人到七個國家，一站一站。', 'From seven people to seven countries, one stop at a time.', '歷史之路是官網上另一頁：捲動就沿著一條路走，每一站可以點開看那一年的說明與照片。後台可以自己加站。', 'Our Road is another page on the site: scroll to walk a road, open any stop to read about that year. Stops are added from the admin area.', '../history/', 10),
  ('come-back', 'airport', 'pier', '回來', 'Come back', '講者、mentor、幫忙看文件、來 retreat。', 'Speakers, mentors, essay readers, the retreat.', '校友自己在設定頁填故事、自己勾同意，就出現在官網的 Alumni 航線圖上。想回來幫忙，從那裡開始。', 'Alumni write their own story in settings and give consent themselves, and appear on the Alumni route map. Coming back to help starts there.', '../alumni/', 20)
on conflict (id) do nothing;

insert into public.island_connections (a, b, why_zh, why_en) values
  ('curriculum', 'mentorship', '探索營結束，學員接著申請配對一位 mentor。', 'After the bootcamp, students apply to be paired with a mentor.'),
  ('cr', 'curriculum', '校園講座聽到的人，下一步就是報名探索營。', 'Students who hear a school talk sign up for the bootcamp next.'),
  ('sponsorship', 'curriculum', '贊助與募資讓探索營對學員維持 0 元。', 'Sponsorship and the campaign keep the bootcamp free for students.'),
  ('marketing', 'curriculum', '每一場探索營都先在 Instagram 公布。', 'Every bootcamp is announced on Instagram first.'),
  ('marketing', 'cr', '校園講座的場次與回顧由 Marketing 發。', 'Marketing posts the school talks and their recaps.'),
  ('internship', 'curriculum', '實習生在探索營現場幫忙。', 'Interns help run the bootcamp on the day.'),
  ('internship', 'marketing', '實習生幫 Marketing 做貼文與影片。', 'Interns help Marketing with posts and video.'),
  ('sponsorship', 'commons', '嘖嘖募資的進度在全員會議上報。', 'The campaign''s progress is reported at all-hands.'),
  ('mentorship', 'airport', 'Mentor 幾乎都是校友，從機場回來。', 'Almost every mentor is an alumnus, landing here.'),
  ('cr', 'airport', '回母校演講的校友從這裡上島。', 'Alumni who go back to speak at their schools land here.'),
  ('curriculum', 'airport', '探索營的講者與學員都從機場來。', 'Bootcamp speakers and students both arrive through the airport.'),
  ('commons', 'airport', 'Retreat 的時候校友也回來。', 'Alumni come back for the retreat too.'),
  ('commons', 'curriculum', '全員會議與 retreat。', 'All-hands and the retreat.'),
  ('commons', 'internship', '全員會議與 retreat。', 'All-hands and the retreat.'),
  ('commons', 'mentorship', '全員會議與 retreat。', 'All-hands and the retreat.'),
  ('commons', 'marketing', '全員會議與 retreat。', 'All-hands and the retreat.'),
  ('commons', 'cr', '全員會議與 retreat。', 'All-hands and the retreat.')
on conflict (a, b) do nothing;

commit;

-- ---------- 驗收 ----------
select * from (
  with t as (
    select (select count(*) from island_teams) as teams, (select count(*) from island_programs) as progs, (select count(*) from island_connections) as conns,
           (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname in ('can_edit_island_team', 'upsert_island_team', 'upsert_island_program', 'delete_island_program', 'upsert_island_connection', 'delete_island_connection', 'public_island')) as fns,
           (select count(*) from pg_proc p, aclexplode(p.proacl) x where p.proname = 'public_island' and x.grantee = 'anon'::regrole and x.privilege_type = 'EXECUTE') = 1 as anon_ok,
           (select count(*) from pg_proc p, aclexplode(p.proacl) x where p.proname in ('upsert_island_team', 'upsert_island_program', 'delete_island_program', 'upsert_island_connection', 'delete_island_connection') and x.grantee = 'anon'::regrole) = 0 as anon_no_write,
           (select count(*) from information_schema.table_privileges where table_name in ('island_teams', 'island_programs', 'island_connections') and grantee = 'anon') = 0 as anon_no_table,
           (select jsonb_array_length(public.public_island()->'teams')) as pub_teams
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when teams = 8 and progs >= 17 and conns >= 17 and fns = 7 and anon_ok and anon_no_write and anon_no_table and pub_teams = 8 then 'PASS' else 'FAIL' end as 結果 from t
  union all select 1, '八座島、至少 17 棟、至少 17 條線', '8|17+|17+', teams::text || '|' || progs::text || '|' || conns::text, case when teams = 8 and progs >= 17 and conns >= 17 then 'PASS' else 'FAIL' end from t
  union all select 2, '七支函式在', '7', fns::text, case when fns = 7 then 'PASS' else 'FAIL' end from t
  union all select 3, '沒登入叫得動 public_island()，回八座島', 'true|8', anon_ok::text || '|' || pub_teams::text, case when anon_ok and pub_teams = 8 then 'PASS' else 'FAIL' end from t
  union all select 4, '★ 沒登入叫不動寫的五支、讀不到三張表', 'true|true', anon_no_write::text || '|' || anon_no_table::text, case when anon_no_write and anon_no_table then 'PASS' else 'FAIL' end from t
) q order by ord;
