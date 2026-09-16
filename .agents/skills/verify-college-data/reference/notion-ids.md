# Notion IDs for the BT college database

**Check these before trusting them.** As of 2026-09-16 all three pages still live in Paul's
personal "Pin Wang" Notion workspace. If they were later moved with "Duplicate to" rather than
dragged, every ID below changed. Confirm with `notion-search` or by opening a page, and update
this file if they did.

The MCP connector reaches only the personal workspace. If a fetch returns
`object_not_found`, the content is in the BT workspace and you need Chrome
(`mcp__claude-in-chrome__*`) or a re-authorised connector. See the `notion-workspaces` memory.

## Pages

| Page | ID |
|---|---|
| Entry page, "Start Here 從這裡開始" | `3dcf93cd-25dc-81ff-bd6d-fa6e2a0e4fe8` |
| English, "beyond taiwan college application resources" | `3daf93cd-25dc-81b2-ab8a-ebb0e1453430` |
| Chinese, "海外大學資料庫（中文版）" | `3daf93cd-25dc-81b5-bca8-f0bba5f96ee9` |

All three must move workspaces **together**. The Chinese page shows linked views of the databases
that live under the English page; move one alone and those views break.

## Databases and data sources

Query with `notion-query-data-sources` using `collection://<data source id>` as the table name.

| Table | Database ID | Data source ID |
|---|---|---|
| American Universities (40) | `79bead76df374c4a97ebbc4c8403e390` | `36ce31d4-7bd7-44fc-af56-2aa0df5100e2` |
| Canadian Universities (10) | `35569850db1049a19847864cee1fbb7f` | `8dd62be8-9aed-48af-8029-ff45f4a17626` |
| British Universities (15) | `2ff7fb4b006e48b4a334ad1f62a4b940` | `b347222f-5905-40bd-a40e-269922a589a8` |
| Australian Universities (8) | `59b516f0311340d9a2b245ef4cb53495` | `d118e0e1-74e0-4e3b-b07c-065f9d57e67a` |
| Asian Universities (15) | `4ba13e6ca6f54fddb840a5bbb33a0755` | `843404cd-64a4-49af-84bd-24baccc3fb65` |
| European Universities (10) | `97454dd823624b0580a2305f3ee90f5b` | `0eca5e8a-dd17-4636-a87f-1554ceea0786` |
| Community Colleges and Transfer (14) | `1d5b3d6aa16944a3b26790eafd44381c` | `3fdc0e4e-d82b-4d12-b09c-98fad7cba086` |

## Views

Update with `notion-update-view`. Add a new column to a view or nobody sees it.

| Table | A to Z (default) | By ranking | Cities (gallery) |
|---|---|---|---|
| US | `3f261735-9cc9-4c9f-bdf4-85e6fedefcce` | `3daf93cd-25dc-81a8-be46-000cb291195c` | `3daf93cd-25dc-819b-b356-000c7a0c72a7` |
| CA | `bfa32cc7-7f8a-48c7-b35c-4d8294105929` | `3daf93cd-25dc-813a-8c6e-000cd49c2564` | `3daf93cd-25dc-813a-83bd-000c822e411d` |
| UK | `fb8ae0fe-515f-4b4b-908f-74c38fe417ad` | `3daf93cd-25dc-81f8-a328-000c1c0bd1ce` | `3daf93cd-25dc-815e-a083-000cf4a7b03a` |
| AU | `a8ab7dbf-7e66-404b-8599-4bc71be2e1b6` | `3daf93cd-25dc-8122-a802-000c77032fac` | `3daf93cd-25dc-8119-b442-000c38467629` |
| Asia | `eedf2ed7-01f8-4ebf-b617-b2fe996c5c00` | `3daf93cd-25dc-8147-95e1-000c3fcd9a00` | `3daf93cd-25dc-81ff-b355-000cda0f807d` |
| EU | `2cdbd5b5-b5e9-48ba-aa78-f8a74e5c6c84` | `3daf93cd-25dc-8136-a85c-000cd6d49676` | `3daf93cd-25dc-8147-847e-000c2fad203a` |
| CC | `5b6997a3-30af-4a02-bf6b-0d31066505d0` | none | `3dbf93cd-25dc-81df-9f94-000c5727c57a` is "By guarantee", a board |

Standard `SHOW` for a university table:

```
SHOW "Rank", "City", "Acceptance", "Tuition", "TOEFL", "TOEFL 2026", "IELTS", "Duolingo", "SAT / ACT", "Well-known Majors"
```

Asia adds `"Country"` after `"Rank"`. "By ranking" additionally needs
`CLEAR SORT; SORT BY "Ranking" ASC;` in front.

## Linked-view block IDs on the Chinese page

The Chinese page embeds the databases as linked views. If you ever use `replace_content` on that
page you must re-use these block URLs **verbatim**, or the embeds are destroyed.

美國 `3daf93cd25dc8113b584f4b0b2bf74f1` · 加拿大 `3daf93cd25dc816b9ce8ee78d36f9b75` ·
英國 `3daf93cd25dc81c690d3ea6fdb8f9170` · 澳洲 `3daf93cd25dc818c8f0aecffd6abcaaa` ·
亞洲 `3daf93cd25dc817cb90af5b2b8d1ea8f` · 歐洲 `3daf93cd25dc81b299d4d91ff254a04c` ·
社區大學 `3dbf93cd25dc81b08f12f41224465653`

Prefer `update_content` with search-and-replace over `replace_content` for this reason.

## Columns

Shared by the six university tables:

`Name` (title) · `中文校名` · `Ranking` (number, hidden) · `Rank` (formula, band) ·
`Acceptance Rate` (number, hidden) · `Acceptance` (formula, band) · `City` · `Tuition` ·
`TOEFL` (old 0-120 scale) · `TOEFL 2026` (new 1-6 scale) · `IELTS` · `Duolingo` ·
`SAT / ACT` (select) · `Well-known Majors` (multi-select) · `Official Info` (url) ·
`Test Notes` (English) · `考試眉角` (Chinese) · `Major Rankings` / `科系亮點` ·
`City Fun Fact` / `城市玩什麼` · `Type` · `Enrollment` · `Campus Setting` ·
`Student-Faculty Ratio`

Asia also has `Country`. The community college table has its own shape.

### Formula columns

`Rank` and `Acceptance` are formulas and are `notAvailableInQuerySql`: you cannot read them back
with SQL, and `fetch` returns a `formulaResult://` reference instead of a value. Read the hidden
`Ranking` and `Acceptance Rate` numbers instead.

Band definitions differ by region. US:

```
if(empty(prop("Ranking")), "", if(prop("Ranking") <= 10, "Top 10", if(prop("Ranking") <= 25, "11 to 25", if(prop("Ranking") <= 50, "26 to 50", if(prop("Ranking") <= 100, "51 to 100", "over 100")))))
```

Canada uses `Top 3 in Canada / 4 to 7 / 8 to 10`, the UK `Top 5 in the UK / 6 to 10 / 11 to 15`,
Australia `Top 3 in Australia / 4 to 6 / 7 to 8`, Asia and Europe
`World top 20 / World 21 to 50 / World 51 to 100 / World over 100`.

## Known limits

- Multi-data-source SQL needs a Notion Business plan. Query each data source separately.
  If `query_multiple_data_sources` refuses, call `notion-show-advanced-analysis-next-steps`
  exactly once and pass the link on to Paul.
- `notion-move-pages` has been blocked by the permission classifier before. Do not retry it
  silently; tell Paul he can drag the pages in Notion himself.

## Standing open items as of 2026-09-16

- The Google Form link is still the placeholder `[這裡貼 Google Form 連結]` on all three pages.
- All three pages are still in the personal workspace.
