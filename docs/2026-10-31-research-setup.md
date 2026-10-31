# Research button: one-time setup (2026-10-31)

The **Research this school** button in the admin (Marketing → College intro posts → open a post) asks Claude to look up a school on the web, fill the empty fields with numbers and sources, and suggest Wikimedia photos. People still open each source and tick every number before a post can be approved.

The button needs an Anthropic API key. You do this once. About 15 minutes.

> ⚠ The API key spends BT's money. Paste it only into Supabase Vault. Never into chat, docs, LINE, email or the repo.

## What it costs

- Each school runs five searches in parallel on Claude Opus 5.5. Expect roughly **US$3 to 5 per school**. The admin shows the real cost of each post's research under the button, so check the first few and adjust the limit below.
- Prices used for that estimate (checked 2026-10-31 on the Anthropic pricing page): input US$4 per million tokens, output US$20 per million tokens, web search US$10 per 1,000 searches, web fetch free.
- The site itself stops at 50 jobs a day (ten schools). The spend limit in step 2 is the real ceiling.

## 1. Create the Anthropic account

1. Open https://console.anthropic.com and sign up with the **BT main account** (beyondtaiwan2020@gmail.com), so the account stays with BT after handover.
2. Organization name: `Beyond Taiwan`.
3. Settings → Members: invite the other Co-President as an admin. At handover, the outgoing admin invites the new person, then removes themselves.

## 2. Add credit and set a limit

1. Settings → Billing: add prepaid credit. US$20 covers about four to six schools.
2. Settings → Limits: set a **monthly spend limit**, for example US$30. When it runs out, the button says the Anthropic credit ran out; nothing else on the site is affected.
3. Optional: turn on auto-reload only if you are comfortable with it. Prepaid credit with no auto-reload is the safest.

## 3. Create the key

1. Settings → API keys → **Create key**. Name it `bt-site research`.
2. Copy the key (it starts with `sk-ant-`). The console shows it only once.

## 4. Store the key in Supabase

1. In Supabase project `norjaglyaotzewxavmhv`, Database → Extensions: check that **pg_net** is on. It already is if the site's emails work.
2. Optional but recommended: also turn on **pg_cron**. With it, research keeps going even if everyone closes the page. Without it, research only moves forward while someone has the post open.
3. Supabase Vault (under Project Settings or Integrations) → **Add new secret**:

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | the key from step 3 |

4. In the SQL Editor, run `supabase/migrations/2026-11-28-college-research.sql`. Every row must say **PASS**. Row 10 should say the key is there.

## 5. Try it

1. Admin → Marketing → College intro posts → start a post for a new school.
2. Press **Research this school**. The form locks while five searches run (3 to 5 minutes). The page updates by itself.
3. When it finishes: read **Notes from Claude** (disagreements between sources, things it could not verify), check the badges next to each source (whether the quoted line was found on the page), use the suggested photos you like, then open each source and tick each number yourself.

## When something breaks

- **"The API key no longer works"**: someone deleted or rotated the key. Create a new one (step 3) and edit `ANTHROPIC_API_KEY` in Vault. Do not add a second secret with the same name.
- **"The Anthropic credit ran out"**: add credit or raise the monthly limit (step 2).
- **"Took too long" or "The reply was malformed"**: press Research again. It only fills fields that are still empty.
- **"Claude declined this one"**: research that slide by hand. This is rare for college facts.
- **Research never finishes**: pg_net may be off (step 4.1), or nobody has the page open and pg_cron is off (step 4.2).
- **Someone leaves BT**: remove them from the Anthropic organization. If they ever saw the key, create a new key and replace it in Vault.
