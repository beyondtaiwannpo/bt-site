# Instagram connection: one-time setup (2026-10-29)

Once this is done, the admin's Marketing area (`/admin/marketing/`) shows that it is connected to @beyondtaiwan, with the follower and post counts. Later batches build post results and the college intro post generator on top of this connection.

You only do this once. The site renews the access token by itself every 10 days or so, so it does not expire. At handover, the next person only needs to know three things:

- who holds the BT main account password (beyondtaiwan2020@gmail.com)
- that the Meta app is called `BT Site Instagram` and is owned by the BT main account
- that the token lives in Supabase Vault as `INSTAGRAM_TOKEN`

> ⚠ The access token is the key to the BT Instagram account. Paste it only into Supabase Vault. Never into chat, docs, LINE, email or the repo.

Time: about 45 minutes. Do it on a computer, not a phone.

## 0. Check the Instagram account

1. In the Instagram app, signed in as @beyondtaiwan: Settings → "Account type and tools". It must say **Professional account** (Business is best; Creator also works). If it says Personal, switch to Professional → Business.
2. The account must be **public**.

## 1. Create the Meta app

Stay signed in to Facebook as the **BT main account** the whole time (not your personal account). If the BT main account has no Facebook login, create one with beyondtaiwan2020@gmail.com first. The app should belong to BT, not to a person who leaves next year.

1. Open https://developers.facebook.com/apps and click **Create App**. If it asks you to register as a developer first, do that with the BT main account.
2. Use case: choose **Other** → Next.
3. App type: choose **Business** → Next.
4. App name: `BT Site Instagram`. Contact email: beyondtaiwan2020@gmail.com. Business portfolio: skip for now. Click **Create app**.
5. On the app's dashboard, scroll to **Instagram** and click **Set up**. The page "API setup with Instagram login" appears in the left menu.

## 2. Add @beyondtaiwan and get the token

1. Left menu: Instagram → **API setup with Instagram login**.
2. Under "1. Generate access tokens", click **Add account** and sign in to Instagram as **@beyondtaiwan**. Allow everything it asks.
   If it says the account must be a tester first: left menu → App roles → Roles → **Add people** → Instagram Tester → `beyondtaiwan`. Then, in the Instagram app: Settings → Website permissions → Apps and websites → Tester invites → Accept. Come back and click Add account again.
3. Next to @beyondtaiwan, click **Generate token**. Tick that you understand, then **copy the token**. It is a long string starting with `IG`. This is the only time Meta shows it.
4. Leave the app in **Development** mode. Do not submit it for App Review. Because the site only reads and posts to BT's own account, which you just added to the app, Development mode is enough.

## 3. Store the token in Supabase

1. In Supabase project `norjaglyaotzewxavmhv`, go to Database → Extensions, search for **http**, and check it is on. It is already on if Google Calendar is set up.
2. In Supabase Vault (under Project Settings or Integrations), click **Add new secret**:

   | Name | Value |
   |---|---|
   | `INSTAGRAM_TOKEN` | the token from step 2.3 |

   The name must match exactly. No spaces before or after the token.
3. In the SQL Editor, run `supabase/migrations/2026-11-26-instagram-connect.sql` (paste the whole file, click Run). Every row in the table at the end must say **PASS**. Row 10 should say the token is there.
   If you already ran it before putting the token in Vault, you do not need to run it again.

## 4. Check it works

1. Open https://beyondtaiwannpo.com/admin/marketing/ and sign in.
2. Click **Check again**. You should see @beyondtaiwan, "Business", the follower count and the post count.
3. The token line says "Valid until about …". That date is an estimate until the first automatic renewal, about 10 days later. After that it shows the exact date.

If Supabase has **pg_cron** turned on (Database → Extensions), the site checks once a day at 03:17 UTC and renews the token when needed. If pg_cron is off, the page says so. In that case a Co-President or a Marketing manager should press Check again about once a month, which also renews the token.

## When something breaks

- **The page says Instagram no longer accepts the token (code 190)**: the token was revoked or expired. Common causes: someone changed the @beyondtaiwan password, removed the app under Instagram's "Apps and websites", or nobody pressed Check again for 60 days while pg_cron was off. Redo step 2 (Generate token), then in Vault **edit** `INSTAGRAM_TOKEN` and paste the new one. Do not add a second secret with the same name. Then press Check again.
- **"Automatic token renewal failed"**: the old token keeps working until its date. Press Check again the next day. If it keeps failing and the date is less than 10 days away, redo step 2.
- **Could not reach Instagram**: usually a short network problem. It tries again the next day.
- **Someone else takes over the BT main account**: nothing to redo, as long as the @beyondtaiwan password stays the same.
- **Meta changes its rules and asks for App Review**: stop and tell the Co-President. App Review needs a short screen recording and a privacy policy link (`https://beyondtaiwannpo.com/privacy/`). It is a separate decision, not a quick fix.

## What this connection can and cannot do

- Batch 1 (now): read the account name, type, follower count and post count.
- Later batches: read each post's results (reach, likes, saves, shares, comments), and publish a carousel, but only after a second person approves it in the admin.
- It never reads private messages, and nothing posts by itself.
