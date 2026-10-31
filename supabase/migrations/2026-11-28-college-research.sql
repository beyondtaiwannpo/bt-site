-- 後台 Marketing 區：大學介紹貼文的「幫我研究這所學校」按鈕　2026-11-28
--
-- 用法：整份貼進 Supabase SQL Editor 按一次 Run。可以重跑，不動既有資料。最後印一張 PASS / FAIL 表。
-- **先做完 docs/2026-10-31-research-setup.md**（Anthropic 開一把 API key、設每月上限、放進 Vault 叫 ANTHROPIC_API_KEY），再跑這支。
-- 沒做完也可以先跑：按鈕會說「還沒設定」，做完設定不用再跑一次。
-- 要先跑過 2026-11-27-college-posts.sql。用到 pg_net（寄信已經在用）；pg_cron 有開的話每分鐘推一次進度。
--
-- Paul 2026-10-29：「研究直接做成後台按鈕」。2026-10-31：「Research next」。
--
-- ============================================================================
-- 這一支在做什麼
-- ============================================================================
--   1. 按下「幫我研究」：一篇貼文開五個工作（學校資訊、申請數字、考試與時程、熱門科系、Fun facts），
--      每個工作叫一次 Claude（claude-opus-5-5，開網路搜尋與讀網頁），五個同時跑。
--      用 pg_net 在背景送（不卡畫面），回來的答案由 mkt_research_tick() 收：pg_cron 每分鐘一次，畫面開著時每 10 秒也會推一次。
--   2. Claude 要照規矩回：每個數字附來源網址與頁面上那一句、沒看到就空著、學校自己的頁面優先、三種來源都列（Paul 2026-10-29「全部」）。
--      回來的東西**只填空著的欄位**，不蓋掉人已經填的。數字的勾一個都不會自動打，還是要人點開確認。
--   3. 收到之後，資料庫自己再去打開每一個來源網址，看頁面上找不找得到那一句（找得到／只找到數字／找不到／打不開）。
--      很多網站擋機器（U.S. News 常常 403），打不開的就要人自己點開。這一步只是幫忙，不能取代人勾。
--   4. 照片：Claude 從 Wikimedia Commons 找建議的照片（網址、作者、授權），存在工作的結果裡，人在編輯畫面按「用這張」才放進去。
--   5. 錢：每個工作記用了多少 token 與幾次搜尋，畫面上換算成美金（Opus 5.5：輸入每百萬 4 美元、輸出每百萬 20 美元、搜尋每千次 10 美元，2026-10-31 查的）。
--      一天最多 50 個工作（十所學校），超過就擋。Paul 在 Anthropic 那邊另外設每月上限。
--   通行證（API key）**只在 Vault**，任何函式都不回它。
-- ============================================================================

begin;

create table if not exists public.mkt_research_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.college_posts(id) on delete cascade,
  grp text not null check (grp in ('basic', 'admissions', 'policy', 'majors', 'fun')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'done', 'failed')),
  step int not null default 0,          -- 第幾次送（Claude 搜尋太久會先停一下 pause_turn，要接著送）
  retries int not null default 0,       -- 429、5xx 重送幾次了
  messages jsonb not null default '[]'::jsonb,
  request_id bigint,
  sent_at timestamptz,
  result jsonb,
  error text,
  usage jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mkt_research_jobs_post on public.mkt_research_jobs (post_id, created_at desc);
alter table public.mkt_research_jobs enable row level security;
revoke all on public.mkt_research_jobs from public, anon, authenticated;

create table if not exists public.mkt_source_checks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.college_posts(id) on delete cascade,
  key text not null,
  url text not null,
  quote text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'found', 'numbers', 'not_found', 'unreachable')),
  request_id bigint,
  sent_at timestamptz,
  checked_at timestamptz,
  unique (post_id, key, url, quote)
);
alter table public.mkt_source_checks enable row level security;
revoke all on public.mkt_source_checks from public, anon, authenticated;

-- ---------- 1. 準備好了沒 ----------
create or replace function public.mkt_research_ready()
returns boolean language plpgsql security definer stable
set search_path = public, vault, pg_temp
as $$
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return false; end if;
  return exists (select 1 from vault.decrypted_secrets where name = 'ANTHROPIC_API_KEY' and coalesce(btrim(decrypted_secret), '') <> '');
exception when others then return false;
end $$;
revoke all on function public.mkt_research_ready() from public, anon, authenticated;

-- ---------- 2. 給 Claude 的話 ----------
-- 規矩（system）跟 .claude/skills/verify-college-data 同一套：數字一定要是打開頁面親眼看到的。
create or replace function public.mkt_research_system()
returns text language sql immutable
set search_path = public, pg_temp
as $$ select $s$You research US universities for Beyond Taiwan (BT), a student nonprofit that helps Taiwanese public high school students apply abroad. Your findings go onto an Instagram carousel that students make application decisions from, so accuracy matters more than completeness.

Rules you must follow:
1. A number counts only if you opened the page with web_fetch and saw it there. Search result snippets are pointers, not sources: they garble numbers. Never guess a URL.
2. For every value give the URL you read and the exact short quote from that page that shows it (copy it character for character, under 300 characters).
3. Prefer the university's own pages: its Common Data Set (most recent year), its admissions pages, its international admissions page. Also check College Board BigFuture and U.S. News where relevant. When sources disagree, list each one as its own source, put the value from the school's own most recent page in "value", and explain the disagreement in "note".
4. If you cannot verify something, leave "value" as an empty string and say why in "note". Blank means unknown. Never fill from memory.
5. Use the plan names the school actually has (Early Action, Restrictive Early Action, Early Decision I and II, Regular Decision). Never invent an EA round.
6. English tests: report exactly what the school's own page says. If it publishes recommended or typical scores rather than minimums, say so in "note". Say whether a TOEFL score is on the new 1 to 6 scale or the old 0 to 120 scale.
7. Photos: only from Wikimedia Commons, only with a license that allows reuse (public domain, CC0, CC BY, CC BY-SA). Give the direct image URL in the form https://upload.wikimedia.org/wikipedia/commons/thumb/<a>/<ab>/<File>/1280px-<File> and the Commons file page URL. No photos of students or minors.
8. Chinese text is Traditional Chinese as used in Taiwan (台灣用語), short and plain.
9. Today is $s$ || to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM-DD') || $s$. Use the current or upcoming application cycle and say which entry year in "note".

Answer with one JSON object and nothing else, inside a ```json code block, in exactly this shape:
{"facts": {"<key>": {"value": "...", "sources": [{"kind": "cds|school|bigfuture|usnews|collegefactual|wikimedia|wikipedia|other", "url": "https://...", "quote": "..."}], "note": "..."}},
 "fields": {"<field>": "..."},
 "photos": {"<slot>": {"url": "https://upload.wikimedia.org/...", "credit": "author", "license": "CC BY-SA 4.0", "source_url": "https://commons.wikimedia.org/wiki/File:..."}},
 "notes": ["anything a human reviewer must know: disagreements, things you could not verify, dates that look stale"]}
Only use the keys listed in the task. Leave out any key you have nothing verified for.$s$; $$;

-- 每一組要查什麼。格式照 Vanderbilt 那一篇（~/Anson/outputs/bt-website/social/2026-10-31-vanderbilt-college-intro/）。
create or replace function public.mkt_research_task(p_grp text, p_school text)
returns text language sql immutable
set search_path = public, pg_temp
as $$ select 'University: ' || p_school || E'\n\n' || case p_grp
  when 'basic' then $t$Task: basic facts for slide 2 and the cover.
facts:
- "rank": U.S. News National Universities rank, current edition, written like "National 全國 #16" (say the edition year in note).
- "cover_rank": the same rank as a cover tag, like "#16 in US National Universities".
- "type": like "Private 私立" or "Public 公立".
- "setting": like "Urban 都市", "Suburban 郊區", "Rural 鄉村" (U.S. News or BigFuture wording).
- "enrollment": undergraduate enrollment from the Common Data Set B1, like "大學部 7,366人".
fields (no sources needed, but must be correct):
- "cover.zh": the Chinese name commonly used in Taiwan, like "范德堡大學".
- "cover.line1" and "cover.line2": the English name split into two short upper-case lines, like "VANDERBILT" / "UNIVERSITY" or "UNIVERSITY OF" / "WISCONSIN-MADISON".
- "cover.accent": the school's primary brand color as a hex code from its official brand or identity page, like "#CFAE70".
- "cover.line2_color": the same hex as cover.accent, unless that color is too light to read on a cream background; then the school's dark brand color.
- "cover.pennant": one short upper-case word for a pennant, like "VANDERBILT".
- "cover.tags2": four hashtags of well-known majors, like "#Economics #Engineering #ComputerScience #Math".
- "basic.state": the two-letter state code, like "TN".
- "basic.state_label": the state name in English, a newline, then Chinese, like "Tennessee\n田納西州".$t$
  when 'admissions' then $t$Task: admission numbers for slide 3. Use the most recent Common Data Set first, then the school's class profile page, then BigFuture.
facts:
- "acceptance": acceptance rate like "5.4%" (admitted divided by applied from CDS C1; say the entering class year in note).
- "applicants": total first-year applicants like "48,196".
- "gpa": average high school GPA like "3.90" (CDS C12). Empty if the school does not publish one.
- "sat": SAT composite middle 50% like "1510–1560" (CDS C9, 25th to 75th percentile).
- "act": ACT composite middle 50% like "34–35".$t$
  when 'policy' then $t$Task: testing policy, English requirements and the application timeline for slides 3 and 4. Use the school's own admissions pages.
facts:
- "test_note": the SAT/ACT policy for the upcoming entry year as a short line like "Test-optional 可不送" or "Test required 必須送分數". Empty if unclear.
- "toefl", "ielts", "duolingo": the score the school's international page gives, just the number like "5", "7.0", "130". Note whether it is a minimum or a recommendation and which TOEFL scale.
- "timeline": an array of 6 to 8 rows {"date": "...", "en": "...", "zh": "..."} in date order, starting with {"date": "Aug 1", "en": "Applications Open", "zh": "申請開始"} (Common App opening) and ending with {"date": "May 1", "en": "College Decision Day", "zh": "大學錄取決定日"}. In between: each deadline and each decision release the school publishes, like {"date": "Nov 1", "en": "Early Decision I (ED I)", "zh": "第一輪提前決定截止"} or {"date": "Mid-Dec", "en": "ED I Decision Release", "zh": "第一輪結果公佈"}. Combine two plans that share a date into one row. Keep "en" under 24 characters.
fields:
- "timeline.footer": one sentence naming the sources and entry year, ending with "Deadlines may change. Please refer to the university's official website." Mention if Early Decision is binding.
- "apply.footer": one sentence naming the sources for slide 3 (CDS year, admissions pages), saying whether English scores are minimums or recommendations, ending with "Requirements may change. Please refer to the university's official website."$t$
  when 'majors' then $t$Task: popular majors for slide 5.
facts:
- "majors": an array of exactly 6 rows {"en": "Economics", "zh": "經濟", "rank": "#26  By U.S. News"} for well-known undergraduate programs at this school, each with a rank you saw on the ranking page. Prefer U.S. News undergraduate program rankings (current edition); use College Factual (write "#5  By College Factual*") only where U.S. News has no rank. Two spaces between the number and "By". Every row needs a source.
fields:
- "majors.footnote": one sentence naming the ranking editions used; if College Factual appears, add "*College Factual: uses core statistics from official government databases, primarily the Integrated Postsecondary Education Data System (IPEDS), under the U.S. Department of Education."$t$
  else $t$Task: fun facts for slide 6 and photos for every slide.
facts:
- "alumni": an array of exactly 2 rows {"name": "Muhammad Yunus", "desc": "2006 諾貝爾和平獎"} of famous adults who earned a degree at this school (not just attended), well known to Taiwanese students if possible. "desc" is a short Chinese description. Each needs a source showing the degree.
fields:
- "fun.city_en": "Explore <city>", like "Explore Nashville".
- "fun.city_zh": "城市探索".
- "fun.city1" and "fun.city2": two well-known spots in the school's city, English then Chinese, like "The Parthenon 帕德嫩神廟".
photos (Wikimedia Commons only, reusable license, rule 7):
- "campus": a recognizable landscape photo of the main campus or its best-known building.
- "alumni1" and "alumni2": portraits of the two alumni, in the same order.
- "city1" and "city2": the two city spots, in the same order.
- "mascot": the school's mascot, only if Commons has a reusable photo; otherwise leave it out.$t$
  end; $$;

revoke all on function public.mkt_research_system(), public.mkt_research_task(text, text) from public, anon, authenticated;

-- ---------- 3. 送出去（pg_net，背景） ----------
create or replace function public.mkt_research_send(p_job uuid)
returns bigint language plpgsql security definer
set search_path = public, vault, pg_temp
as $$
declare j mkt_research_jobs; v_key text; v_req bigint; v_body jsonb;
begin
  select * into j from mkt_research_jobs where id = p_job for update;
  if j.id is null or j.status not in ('queued') then return null; end if;
  select btrim(decrypted_secret) into v_key from vault.decrypted_secrets where name = 'ANTHROPIC_API_KEY' limit 1;
  v_body := jsonb_build_object(
    'model', 'claude-opus-5-5',
    'max_tokens', 16000,
    'output_config', jsonb_build_object('effort', 'high'),
    'fallbacks', 'default',
    'system', public.mkt_research_system(),
    'tools', jsonb_build_array(
      jsonb_build_object('type', 'web_search_20260209', 'name', 'web_search', 'max_uses', 12),
      jsonb_build_object('type', 'web_fetch_20260209', 'name', 'web_fetch', 'max_uses', 15)),
    'messages', j.messages);
  select net.http_post(
    url := 'https://api.anthropic.com/v1/messages',
    body := v_body,
    params := '{}'::jsonb,
    headers := jsonb_build_object('x-api-key', v_key, 'anthropic-version', '2023-06-01',
                                  'anthropic-beta', 'server-side-fallback-2026-07-01', 'content-type', 'application/json'),
    timeout_milliseconds := 600000) into v_req;
  update mkt_research_jobs set status = 'sent', request_id = v_req, sent_at = now(), step = step + 1, updated_at = now() where id = p_job;
  return v_req;
end $$;
revoke all on function public.mkt_research_send(uuid) from public, anon, authenticated;

-- 把 Claude 最後那段文字裡的 JSON 挖出來（```json ... ``` 或第一個 { 到最後一個 }）。挖不出來回 null。
create or replace function public.mkt_research_parse(p_content jsonb)
returns jsonb language plpgsql immutable
set search_path = public, pg_temp
as $$
declare t text; a int; b int;
begin
  select string_agg(x ->> 'text', E'\n') into t from jsonb_array_elements(coalesce(p_content, '[]'::jsonb)) x where x ->> 'type' = 'text';
  if t is null then return null; end if;
  a := position('{' in t);
  b := length(t) - position('}' in reverse(t)) + 1;
  if a = 0 or b <= a then return null; end if;
  return substr(t, a, b - a + 1)::jsonb;
exception when others then return null;
end $$;
revoke all on function public.mkt_research_parse(jsonb) from public, anon, authenticated;

-- 正規化：小寫、去 HTML 標籤與常見實體、數字裡的逗號拿掉、只留英數與中文、空白合成一個。比對「那一句在不在頁面上」用。
create or replace function public.mkt_norm(p text)
returns text language sql immutable
set search_path = public, pg_temp
as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(lower(
           replace(replace(replace(replace(regexp_replace(coalesce(p, ''), '<[^>]*>', ' ', 'g'), '&nbsp;', ' '), '&amp;', '&'), '&#39;', ''''), '&#8211;', '-')),
           '([0-9]),([0-9])', '\1\2', 'g'),
           '[^a-z0-9㐀-鿿]+', ' ', 'g'),
           '\s+', ' ', 'g'));
$$;
-- 一句話在頁面上的結果：found（整句都在）、numbers（句子對不上，但裡面每一個數字都在）、not_found。
create or replace function public.mkt_quote_on_page(p_quote text, p_page text)
returns text language plpgsql immutable
set search_path = public, pg_temp
as $$
declare q text := public.mkt_norm(p_quote); pg text := ' ' || public.mkt_norm(p_page) || ' ';
        -- 數字另外比：只去標籤與千分位逗號，小數點留著（7.0 不能變成 7 0）。
        raw text := regexp_replace(regexp_replace(coalesce(p_page, ''), '<[^>]*>', ' ', 'g'), '([0-9]),([0-9])', '\1\2', 'g');
        n text; has boolean := false;
begin
  if q <> '' and position(q in pg) > 0 then return 'found'; end if;
  for n in select (regexp_matches(regexp_replace(coalesce(p_quote, ''), '([0-9]),([0-9])', '\1\2', 'g'), '[0-9]+(?:\.[0-9]+)?', 'g'))[1] loop
    if length(n) < 2 then continue; end if;
    has := true;
    if raw !~ ('(^|[^0-9.])' || replace(n, '.', '\.') || '($|[^0-9])') then return 'not_found'; end if;
  end loop;
  return case when has then 'numbers' else 'not_found' end;
end $$;
revoke all on function public.mkt_norm(text), public.mkt_quote_on_page(text, text) from public, anon, authenticated;

-- ---------- 3b. 新貼文的範本值 ----------
-- 開一篇新的貼文時，幾格先放了範本（時程的 Aug 1、May 1、來源那一行小字、紅色）。研究回來的東西「空著或還是範本」才填。
-- **跟 admin/marketing/src/slides.js 的 blankPost() 同一份**（test/marketing-research.test.mjs 比對）。
create or replace function public.mkt_template()
returns jsonb language sql immutable
set search_path = public, pg_temp
as $$ select $j${"cover":{"line1":"","line1_color":"#000000","line2":"","line2_color":"#C5050C","zh":"","accent":"#C5050C","pennant":"","pennant_text":"#FFFFFF","tags1":"","tags2":""},"basic":{"ranking":"","type":"","setting":"","enrollment":"","state":"","state_label":""},"apply":{"acceptance":"","applicants":"","gpa":"","sat":"","act":"","test_note":"","toefl":"","ielts":"","duolingo":"","footer":"Sources: Common Data Set, the university's admissions website, College Board BigFuture. Requirements may change. Please refer to the university's official website."},"timeline":{"rows":[{"date":"Aug 1","en":"Applications Open","zh":"申請開始"},{"date":"","en":"Early Action (EA)","zh":"提早申請"},{"date":"","en":"Regular Decision (RD)","zh":"正規申請"},{"date":"","en":"EA Decision Release","zh":"提早申請結果公佈"},{"date":"","en":"RD Decision Release","zh":"正規申請結果公佈"},{"date":"May 1","en":"College Decision Day","zh":"大學錄取決定日"}],"footer":"Sources: the university's admissions website, Common App. Deadlines may change. Please refer to the university's official website."},"majors":{"rows":[{"en":"","zh":"","rank":""},{"en":"","zh":"","rank":""},{"en":"","zh":"","rank":""},{"en":"","zh":"","rank":""},{"en":"","zh":"","rank":""},{"en":"","zh":"","rank":""}],"footnote":"*College Factual: uses core statistics from official government databases, primarily the Integrated Postsecondary Education Data System (IPEDS), under the U.S. Department of Education."},"fun":{"alumni":[{"name":"","desc":""},{"name":"","desc":""}],"city_en":"Explore","city_zh":"城市探索","city":[{"label":""},{"label":""}]}}$j$::jsonb; $$;
revoke all on function public.mkt_template() from public, anon, authenticated;
-- 這一格現在是空的、或還是範本嗎？
create or replace function public.mkt_untouched(p_data jsonb, p_path text[])
returns boolean language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when p_data #> p_path is null or jsonb_typeof(p_data #> p_path) = 'null' then true
    when jsonb_typeof(p_data #> p_path) = 'string' and btrim(p_data #>> p_path) = '' then true
    when jsonb_typeof(p_data #> p_path) = 'array' and jsonb_array_length(p_data #> p_path) = 0 then true
    else p_data #> p_path = public.mkt_template() #> p_path end;
$$;
revoke all on function public.mkt_untouched(jsonb, text[]) from public, anon, authenticated;

-- ---------- 4. 收到的答案放進貼文：只填空著的 ----------
-- 白名單：Claude 回的 fields 只認這幾格，其他一律不碰。
create or replace function public.mkt_research_fields()
returns table (field text, path text[]) language sql immutable
set search_path = public, pg_temp
as $$
  values ('cover.zh', array['cover','zh']), ('cover.line1', array['cover','line1']), ('cover.line2', array['cover','line2']),
         ('cover.accent', array['cover','accent']), ('cover.line2_color', array['cover','line2_color']), ('cover.pennant', array['cover','pennant']), ('cover.tags2', array['cover','tags2']),
         ('basic.state', array['basic','state']), ('basic.state_label', array['basic','state_label']),
         ('apply.footer', array['apply','footer']), ('timeline.footer', array['timeline','footer']), ('majors.footnote', array['majors','footnote']),
         ('fun.city_en', array['fun','city_en']), ('fun.city_zh', array['fun','city_zh']), ('fun.city1', array['fun','city','0','label']), ('fun.city2', array['fun','city','1','label']);
$$;
revoke all on function public.mkt_research_fields() from public, anon, authenticated;

-- 一個值收不收：數字與文字收字串；時程、科系、校友收規定形狀的陣列（多的欄位丟掉）。
create or replace function public.mkt_research_clean(p_key text, v jsonb)
returns jsonb language plpgsql immutable
set search_path = public, pg_temp
as $$
declare out jsonb := '[]'::jsonb; x jsonb; n int := 0; lim int;
begin
  if p_key in ('timeline', 'majors', 'alumni') then
    if jsonb_typeof(v) <> 'array' then return null; end if;
    lim := case p_key when 'timeline' then 8 when 'majors' then 6 else 2 end;
    for x in select * from jsonb_array_elements(v) loop
      exit when n >= lim;
      if jsonb_typeof(x) <> 'object' then continue; end if;
      out := out || jsonb_build_array(case p_key
        when 'timeline' then jsonb_build_object('date', left(coalesce(x ->> 'date', ''), 20), 'en', left(coalesce(x ->> 'en', ''), 40), 'zh', left(coalesce(x ->> 'zh', ''), 30))
        when 'majors' then jsonb_build_object('en', left(coalesce(x ->> 'en', ''), 40), 'zh', left(coalesce(x ->> 'zh', ''), 12), 'rank', left(coalesce(x ->> 'rank', ''), 40))
        else jsonb_build_object('name', left(coalesce(x ->> 'name', ''), 40), 'desc', left(coalesce(x ->> 'desc', ''), 30)) end);
      n := n + 1;
    end loop;
    return case when n = 0 then null else out end;
  end if;
  if jsonb_typeof(v) <> 'string' or btrim(v #>> '{}') = '' then return null; end if;
  return to_jsonb(left(btrim(v #>> '{}'), 200));
end $$;
revoke all on function public.mkt_research_clean(text, jsonb) from public, anon, authenticated;

-- 放進去。回填了幾格。
create or replace function public.mkt_research_apply(p_post uuid, p_result jsonb)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r college_posts; f record; v jsonb; s jsonb; n int := 0;
begin
  select * into r from college_posts where id = p_post for update;
  if r.id is null or r.status <> 'draft' then return 0; end if;
  -- 數字：沒填才填，來源也一起放（那一格原本沒有來源的話）。
  for f in select * from public.mkt_facts() loop
    v := public.mkt_research_clean(f.key, p_result -> 'facts' -> f.key -> 'value');
    if v is null or not public.mkt_untouched(r.data, f.path) then continue; end if;
    r.data := jsonb_set(r.data, f.path[1:1], coalesce(r.data -> f.path[1], '{}'::jsonb), true);
    r.data := jsonb_set(r.data, f.path, v, true);
    select coalesce(jsonb_agg(jsonb_build_object('kind', coalesce(x ->> 'kind', 'other'), 'url', x ->> 'url', 'quote', left(coalesce(x ->> 'quote', ''), 300))), '[]'::jsonb)
      into s from jsonb_array_elements(case when jsonb_typeof(p_result -> 'facts' -> f.key -> 'sources') = 'array' then p_result -> 'facts' -> f.key -> 'sources' else '[]'::jsonb end) x
     where coalesce(x ->> 'url', '') ~ '^https?://';
    if jsonb_array_length(s) > 0 and coalesce(jsonb_array_length(case when jsonb_typeof(r.sources -> f.key) = 'array' then r.sources -> f.key end), 0) = 0 then
      r.sources := r.sources || jsonb_build_object(f.key, s);
    end if;
    n := n + 1;
  end loop;
  -- 其他文字：白名單裡的才收，也是沒填才填。
  for f in select * from public.mkt_research_fields() loop
    v := public.mkt_research_clean('text', p_result -> 'fields' -> f.field);
    if v is null then continue; end if;
    if not public.mkt_untouched(r.data, f.path) then continue; end if;
    if f.path[1] = 'fun' and f.path[2] = 'city' then
      r.data := jsonb_set(r.data, '{fun}', coalesce(r.data -> 'fun', '{}'::jsonb), true);
      if jsonb_typeof(r.data #> '{fun,city}') is distinct from 'array' or jsonb_array_length(r.data #> '{fun,city}') < 2 then
        r.data := jsonb_set(r.data, '{fun,city}', '[{"label":""},{"label":""}]'::jsonb, true);
      end if;
    else
      r.data := jsonb_set(r.data, f.path[1:1], coalesce(r.data -> f.path[1], '{}'::jsonb), true);
    end if;
    r.data := jsonb_set(r.data, f.path, v, true);
    n := n + 1;
  end loop;
  update college_posts set data = r.data, sources = r.sources, updated_at = now() where id = p_post;
  -- 每一個來源排一次「頁面上找不找得到這一句」。
  insert into mkt_source_checks (post_id, key, url, quote)
  select p_post, k, s2 ->> 'url', s2 ->> 'quote'
    from jsonb_each(r.sources) as e(k, arr), jsonb_array_elements(case when jsonb_typeof(arr) = 'array' then arr else '[]'::jsonb end) s2
   where coalesce(s2 ->> 'url', '') ~ '^https?://' and coalesce(btrim(s2 ->> 'quote'), '') <> ''
  on conflict (post_id, key, url, quote) do nothing;
  return n;
end $$;
revoke all on function public.mkt_research_apply(uuid, jsonb) from public, anon, authenticated;

-- ---------- 5. 收進度：pg_cron 每分鐘、畫面開著時每 10 秒 ----------
create or replace function public.mkt_research_tick()
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare j mkt_research_jobs; c mkt_source_checks; resp record; body jsonb; u jsonb; v_left int; parsed jsonb;
begin
  if to_regclass('net._http_response') is null then return 0; end if;
  -- 5a. 送出去的研究：看回來了沒
  for j in select * from mkt_research_jobs where status = 'sent' order by sent_at for update skip locked loop
    execute 'select status_code, content, timed_out, error_msg from net._http_response where id = $1' into resp using j.request_id;
    if resp is null then
      if j.sent_at < now() - interval '15 minutes' then
        update mkt_research_jobs set status = 'failed', error = 'no reply after 15 minutes', updated_at = now() where id = j.id;
      end if;
      continue;
    end if;
    if coalesce(resp.timed_out, false) or resp.status_code is null then
      update mkt_research_jobs set status = 'failed', error = left('timed out / ' || coalesce(resp.error_msg, ''), 300), updated_at = now() where id = j.id;
      continue;
    end if;
    if resp.status_code in (429, 500, 502, 503, 529) and j.retries < 3 then
      update mkt_research_jobs set status = 'queued', step = step - 1, retries = retries + 1, updated_at = now() where id = j.id;
      continue;
    end if;
    begin body := resp.content::jsonb; exception when others then body := null; end;
    if resp.status_code <> 200 or body is null then
      update mkt_research_jobs set status = 'failed', error = left('HTTP ' || resp.status_code || ': ' || coalesce(body -> 'error' ->> 'message', left(resp.content, 200)), 300), updated_at = now() where id = j.id;
      continue;
    end if;
    -- 用量加起來（重送的那幾次也算錢）
    u := j.usage;
    u := jsonb_build_object(
      'input', coalesce((u ->> 'input')::bigint, 0) + coalesce((body -> 'usage' ->> 'input_tokens')::bigint, 0)
               + coalesce((body -> 'usage' ->> 'cache_creation_input_tokens')::bigint, 0),
      'cache_read', coalesce((u ->> 'cache_read')::bigint, 0) + coalesce((body -> 'usage' ->> 'cache_read_input_tokens')::bigint, 0),
      'output', coalesce((u ->> 'output')::bigint, 0) + coalesce((body -> 'usage' ->> 'output_tokens')::bigint, 0),
      'searches', coalesce((u ->> 'searches')::bigint, 0) + coalesce((body -> 'usage' -> 'server_tool_use' ->> 'web_search_requests')::bigint, 0));
    if body ->> 'stop_reason' = 'pause_turn' and j.step < 6 then
      -- 搜尋還沒做完：把 Claude 這一段原樣接回去再送一次（不加「繼續」那種話）。
      update mkt_research_jobs set status = 'queued', usage = u,
             messages = messages || jsonb_build_array(jsonb_build_object('role', 'assistant', 'content', body -> 'content')), updated_at = now()
       where id = j.id;
      continue;
    end if;
    if body ->> 'stop_reason' <> 'end_turn' then
      update mkt_research_jobs set status = 'failed', usage = u, error = 'stopped: ' || coalesce(body ->> 'stop_reason', '?')
             || coalesce(' / ' || (body -> 'stop_details' ->> 'category'), ''), updated_at = now() where id = j.id;
      continue;
    end if;
    parsed := public.mkt_research_parse(body -> 'content');
    if parsed is null then
      update mkt_research_jobs set status = 'failed', usage = u, error = 'reply was not the expected JSON', updated_at = now() where id = j.id;
      continue;
    end if;
    update mkt_research_jobs set status = 'done', usage = u, result = parsed, error = null, updated_at = now() where id = j.id;
    perform public.mkt_research_apply(j.post_id, parsed);
  end loop;
  -- 5b. 排隊中的研究：送出去
  for j in select * from mkt_research_jobs where status = 'queued' order by created_at limit 10 loop
    perform public.mkt_research_send(j.id);
  end loop;
  -- 5c. 來源檢查：回來的比對，排隊的送（一次最多 20 個）
  for c in select * from mkt_source_checks where status = 'sent' for update skip locked loop
    execute 'select status_code, content, timed_out, content_type from net._http_response where id = $1' into resp using c.request_id;
    if resp is null then
      if c.sent_at < now() - interval '5 minutes' then update mkt_source_checks set status = 'unreachable', checked_at = now() where id = c.id; end if;
      continue;
    end if;
    update mkt_source_checks set checked_at = now(), status = case
        when coalesce(resp.timed_out, false) or resp.status_code is distinct from 200 then 'unreachable'
        -- 只比網頁與純文字。試算表（Common Data Set 的 .xlsx）、PDF 這些機器讀不了，算「自己點開」。
        when coalesce(resp.content_type, '') !~* '^\s*(text/html|text/plain|application/xhtml\+xml|application/json)' then 'unreachable'
        else public.mkt_quote_on_page(c.quote, resp.content) end
     where id = c.id;
  end loop;
  for c in select * from mkt_source_checks where status = 'queued' order by post_id limit 20 loop
    update mkt_source_checks set status = 'sent', sent_at = now(),
           request_id = net.http_get(url := c.url, params := '{}'::jsonb,
             headers := '{"User-Agent": "Mozilla/5.0 (compatible; BeyondTaiwan-SourceCheck/1.0; +https://beyondtaiwannpo.com)"}'::jsonb,
             timeout_milliseconds := 20000)
     where id = c.id;
  end loop;
  select count(*) into v_left from mkt_research_jobs where status in ('queued', 'sent');
  return v_left;
end $$;
revoke all on function public.mkt_research_tick() from public, anon, authenticated;

-- ---------- 6. 後台用的兩支 ----------
-- 按下「幫我研究這所學校」。草稿才行、同一篇不能同時跑兩次、一天最多 50 個工作。
create or replace function public.mkt_research_start(p_post uuid)
returns int language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r college_posts; g text;
begin
  if not public.mkt_can_edit() then raise exception 'not_marketing_editor' using errcode = 'P0001'; end if;
  if not public.mkt_research_ready() then raise exception 'research_not_ready' using errcode = 'P0001'; end if;
  select * into r from college_posts where id = p_post for update;
  if r.id is null then raise exception 'no_such_post' using errcode = 'P0001'; end if;
  if r.status <> 'draft' then raise exception 'not_draft' using errcode = 'P0001'; end if;
  if exists (select 1 from mkt_research_jobs where post_id = p_post and status in ('queued', 'sent')) then raise exception 'research_running' using errcode = 'P0001'; end if;
  if (select count(*) from mkt_research_jobs where created_at > now() - interval '24 hours') + 5 > 50 then raise exception 'research_daily_limit' using errcode = 'P0001'; end if;
  foreach g in array array['basic', 'admissions', 'policy', 'majors', 'fun'] loop
    insert into mkt_research_jobs (post_id, grp, messages, created_by)
    values (p_post, g, jsonb_build_array(jsonb_build_object('role', 'user', 'content', public.mkt_research_task(g, coalesce(nullif(r.data ->> 'school', ''), r.school)))), auth.uid());
  end loop;
  perform public.mkt_research_tick();
  return 5;
end $$;

-- 進度與結果：準備好了沒、這一篇最近一次研究的五個工作、每個來源的檢查結果、花了多少。叫的時候順便推一次進度。
create or replace function public.mkt_research_status(p_post uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_jobs jsonb; v_checks jsonb; v_cost numeric;
begin
  if not public.mkt_can_view() then raise exception 'not_marketing' using errcode = 'P0001'; end if;
  begin perform public.mkt_research_tick(); exception when others then null; end;
  select coalesce(jsonb_agg(jsonb_build_object('grp', grp, 'status', status, 'error', error, 'usage', usage, 'created_at', created_at, 'updated_at', updated_at,
                                               'notes', coalesce(result -> 'notes', '[]'::jsonb), 'photos', coalesce(result -> 'photos', '{}'::jsonb),
                                               'facts', (select coalesce(jsonb_object_agg(k, jsonb_build_object('note', x -> 'note', 'value', x -> 'value')), '{}'::jsonb)
                                                           from jsonb_each(coalesce(result -> 'facts', '{}'::jsonb)) as e(k, x)))
                            order by array_position(array['basic', 'admissions', 'policy', 'majors', 'fun'], grp)), '[]'::jsonb)
    into v_jobs
    from (select distinct on (grp) * from mkt_research_jobs where post_id = p_post order by grp, created_at desc) t;
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'url', url, 'quote', quote, 'status', status)), '[]'::jsonb) into v_checks
    from mkt_source_checks where post_id = p_post;
  -- 錢（美金）：Opus 5.5 輸入 4、快取讀 0.2、輸出 20（每百萬 token），搜尋每次 0.01。2026-10-31 查的價目。
  select round(coalesce(sum((usage ->> 'input')::numeric * 4 + coalesce((usage ->> 'cache_read')::numeric, 0) * 0.2 + (usage ->> 'output')::numeric * 20) / 1000000
                        + sum(coalesce((usage ->> 'searches')::numeric, 0)) * 0.01, 0), 2) into v_cost
    from mkt_research_jobs where post_id = p_post and usage ? 'input';
  return jsonb_build_object('ready', public.mkt_research_ready(), 'jobs', v_jobs, 'checks', v_checks, 'cost_usd', v_cost,
                            'today', (select count(*) from mkt_research_jobs where created_at > now() - interval '24 hours'), 'daily_limit', 50);
end $$;
revoke all on function public.mkt_research_start(uuid), public.mkt_research_status(uuid) from public, anon;
grant execute on function public.mkt_research_start(uuid), public.mkt_research_status(uuid) to authenticated;

-- ---------- 7. pg_cron 每分鐘推一次 ----------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'bt-research-tick';
    perform cron.schedule('bt-research-tick', '* * * * *', 'select public.mkt_research_tick()');
  end if;
end $$;

commit;

-- ---------- 驗收 ----------
select * from (
  with f as (
    select proname, regexp_replace(prosrc, '--[^\n]*', '', 'g') as body, prosecdef
      from pg_proc where pronamespace = 'public'::regnamespace and proname like 'mkt\_research\_%'
  ), s as (
    select
      (select relrowsecurity from pg_class where oid = 'public.mkt_research_jobs'::regclass)
        and (select relrowsecurity from pg_class where oid = 'public.mkt_source_checks'::regclass) as rls,
      (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name in ('mkt_research_jobs', 'mkt_source_checks')
          and grantee in ('anon', 'authenticated', 'PUBLIC')) as tbl_grants,
      (select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('mkt_research_ready', 'mkt_research_send', 'mkt_research_tick', 'mkt_research_apply', 'mkt_research_parse', 'mkt_research_clean',
                            'mkt_research_system', 'mkt_research_task', 'mkt_research_fields', 'mkt_norm', 'mkt_quote_on_page')
          and x.grantee in (0::regrole, 'anon'::regrole, 'authenticated'::regrole) and x.privilege_type = 'EXECUTE') as inner_open,
      coalesce((select body from f where proname = 'mkt_research_start'), '') like '%if not public.mkt_can_edit() then raise%' as gate_edit,
      coalesce((select body from f where proname = 'mkt_research_status'), '') like '%if not public.mkt_can_view() then raise%' as gate_view,
      coalesce((select body from f where proname = 'mkt_research_start'), '') like '%research_daily_limit%' as daily,
      coalesce((select body from f where proname = 'mkt_research_apply'), '') like '%if v is null or not public.mkt_untouched(r.data, f.path) then continue%' as fill_empty,
      coalesce((select body from f where proname = 'mkt_research_apply'), '') !~ '(r\.checks|[^_]checks\s*=)' as no_auto_tick,
      coalesce((select body from f where proname = 'mkt_research_status'), '') not like '%decrypted_secret%'
        and coalesce((select body from f where proname = 'mkt_research_status'), '') not like '%x-api-key%' as no_key_out,
      public.mkt_research_ready() as ready,
      to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null as has_net,
      exists (select 1 from pg_extension where extname = 'pg_cron') as cron_on
  )
  select 0 ord, 'OVERALL' as 項目, null::text as 應該是, null::text as 實際是,
    case when rls and tbl_grants = 0 and inner_open = 0 and gate_edit and gate_view and daily and fill_empty and no_auto_tick and no_key_out then 'PASS' else 'FAIL' end as 結果 from s
  union all select 1, '★ 兩張表開了 RLS，沒有任何角色讀得到', 'true|0', rls::text || '|' || tbl_grants, case when rls and tbl_grants = 0 then 'PASS' else 'FAIL' end from s
  union all select 2, '★ 碰金鑰、叫 Claude、寫進貼文的內部函式，網站上的人都叫不動', '0 筆', inner_open::text || ' 筆', case when inner_open = 0 then 'PASS' else 'FAIL' end from s
  union all select 3, '★ 按研究要 Marketing「改」以上', 'true', gate_edit::text, case when gate_edit then 'PASS' else 'FAIL' end from s
  union all select 4, '★ 看進度要是 Marketing 的人', 'true', gate_view::text, case when gate_view then 'PASS' else 'FAIL' end from s
  union all select 5, '一天最多 50 個工作（十所學校）', 'true', daily::text, case when daily then 'PASS' else 'FAIL' end from s
  union all select 6, '★ 研究結果只填空著（或還是範本）的欄位', 'true', fill_empty::text, case when fill_empty then 'PASS' else 'FAIL' end from s
  union all select 7, '★ 研究不會自動打勾（勾一定是人）', 'true', no_auto_tick::text, case when no_auto_tick then 'PASS' else 'FAIL' end from s
  union all select 8, '★ 回給畫面的東西裡沒有金鑰', 'true', no_key_out::text, case when no_key_out then 'PASS' else 'FAIL' end from s
  union all select 9, '資訊：pg_net 在不在（寄信也靠它）', '（看一眼）', case when has_net then '在' else '不在' end, 'PASS' from s
  union all select 10, '資訊：Vault 有沒有 ANTHROPIC_API_KEY（沒有的話按鈕說還沒設定）', '（看一眼）', case when ready then '有' else '還沒有' end, 'PASS' from s
  union all select 11, '資訊：pg_cron 有沒有開（沒開的話，畫面開著時每 10 秒推一次）', '（看一眼）', case when cron_on then '開了，每分鐘一次' else '沒開' end, 'PASS' from s
) t order by ord;
