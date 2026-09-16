---
name: verify-college-data
description: Re-verify BT's public Notion college database (海外大學資料庫) against each university's own admissions page. Use when asked to check, audit, re-verify or refresh that database or any of its seven tables, when someone reports a number in it disagrees with a school's website, when a major test changes its scoring, or when the data is about to be used for outreach or fundraising.
---

# Verify the BT college database

BT publishes a free Notion database of 112 universities for Taiwanese students. This skill re-checks it against the schools' own pages. Run it once a year, ideally in March.

The human-facing SOP is `~/Anson/references/sops/bt-college-database-verification.md`. Read it if you need the background on why this exists. Notion page, database and view IDs are in `reference/notion-ids.md` next to this file.

## The one rule

**A number counts only if you saw it on that university's own page.** Not a search summary, not an aggregator, not last year's table, not your own knowledge. The 2026-09 audit found 61 of 98 university links broken and most numbers wrong, because the original build generated plausible URLs and never opened them.

State this plainly if you report on it. It is a defect in the data, not drift.

## Do not only check numbers

Six classes of error break the *premise* of a column, not its value. Checking "is 100 still 100" misses all six. For every school, ask all six questions:

1. **Does this school accept this test at all?** Oxford rejects any TOEFL sat on or after 21 Jan 2026. Cambridge does not list TOEFL for undergraduate entry. Fourteen schools reject Duolingo outright. Check the reverse too: HKUST accepts Duolingo 125 where the table had a blank.
2. **Does it accept only a specific version?** ANU takes only TOEFL iBT Australia. Sydney rejects the Home Edition. UNSW is not accepting the new TOEFL format at all. UQ recognises only old-scale section scores. Many schools reject TOEFL MyBest, IELTS Indicator and IELTS One Skill Retake.
3. **Is the bachelor's degree even taught in English?** ETH Zurich teaches every bachelor in German (German C1). EPFL teaches its bachelors in French (French B2). TU Delft has exactly four English bachelors. The numbers previously in those rows were the *master's* requirement. This one is the most damaging: a student prepares for the wrong test entirely.
4. **Does the school publish a minimum at all?** Stanford: "We do not require any English proficiency exams." Same for Northwestern, Georgetown, UChicago, Dartmouth, Keio, Yonsei UIC, Korea University, Institute of Science Tokyo, Kyoto iUP, UTokyo PEAK. What they publish is a *typical admitted score*. Never present that as a threshold.
5. **Is there a single university-wide minimum?** Usually not in the UK and Australia. UCL has five levels, Durham four bands, Warwick three, Bath three, St Andrews more than ten, Bristol A to H. Fill the **lowest tier** and put the full range in the notes.
6. **Has the school moved to a new scale only?** NUS now publishes only the new-scale TOEFL; its old-scale cell should be empty. Vanderbilt the same. Watch for self-contradicting pages (Alberta quotes an old-scale 90 for tests up to Jan 2027, which ETS stopped issuing in Jan 2026) and say so in the notes rather than picking a side.

## Procedure

### 1. Links first

Open all 112 `Official Info` URLs. Two traps:
- A curl **403 is not a broken link** (Cloudflare bot-blocking). Confirm those in a real browser before touching them.
- A **200 is not a working link**. Soft-404s return 200 with the wrong page. Check the `<title>`.

### 2. Then the numbers, one school at a time

There is no batch shortcut. For each school:

```
WebSearch with allowed_domains scoped to the school's domain
  → gives you the real requirements URL, and often the figures
WebFetch that URL with a precise prompt
  → if it 403s or returns an empty body, use the browser tools
  → if it is a PDF and comes back as binary, save it and Read it with `pages`
```

Browser fallback pattern (scores hide inside collapsed tables):

```js
const t = document.body.textContent.replace(/\s+/g,' ');
const i = t.search(/IELTS/i);
t.slice(Math.max(0, i-500), i+2500)
```

Use `document.body.textContent`, never `innerText` — `innerText` returns nothing for collapsed accordions.

Never guess a URL. Guessed English-requirement URLs almost all 404.

### 3. Treat search summaries as pointers, not sources

Search summaries garble numbers: they have reported a Duolingo score as a TOEFL score and "22" as "32". Use them to find the page; read the page for the figure.

### 4. Write back

Numbers go in the property. The explanation goes in **both** `Test Notes` (English) and `考試眉角` (Traditional Chinese) — the two language pages read the same tables, so a note written in only one language is invisible to half the readers. Write real sentences a 17-year-old can act on, not a score dump.

When a value is wrong in a way a student may already have planned around, say so in the note ("the Duolingo figure in this table was too low before"). Do not quietly correct it.

### 5. Update the three pages

Refresh the warning callouts and the "last checked" date on the entry page, the English page and the Chinese page. If new instances of the six classes appear, add them to the callout that lists them.

## Write-back rules (do not relax these)

- **Blank means "we do not know", not "no requirement".** This is stated on all three pages. Leave a cell blank rather than inferring from the ETS concordance: schools set their own mappings (UCSB maps old 80 to new 4.5; Leeds maps the same 80 to 4).
- **Banded schools get the lowest tier**, with the range spelled out in the notes.
- **Ranking and Acceptance stay as bands**, never exact figures. Exact numbers are false precision and people make decisions on them. The raw values stay hidden in the database so "By ranking" still sorts.
- **The Official Info link is the truth.** All three pages say the school is right and BT is wrong. Keep that.
- **BT's own outward-facing numbers** may only come from `~/Anson/wiki/entities/beyond-taiwan.md`. No estimating, no rounding up to a nicer figure.
- **No real names and no photos** on these public pages without asking Paul first. Never anyone under 18.

## Reporting to Paul

Three sections in Traditional Chinese, keeping English for proper nouns, no emoji and no dashes: what changed, how to verify it himself (steps he can click), what is next. Lead with anything in the six classes above, because those are the ones that waste a student's money and months. Give real counts, not "several".

## Cost

The 2026-09 run covered 58 schools in about 90 tool calls on Opus. Use Opus. Sonnet is cheaper but this data hurts people when it is wrong.

If it must be split, do Asia and Europe first (most restructuring, most structural errors), then the UK and Australia (banded requirements), then the US and Canada (mostly single university-wide minimums).
