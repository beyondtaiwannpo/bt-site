# Meetings on Google Calendar: one-time setup (2026-10-29)

Once this is done, scheduling a meeting on the site creates it on Google Calendar from the BT main account (beyondtaiwan2020@gmail.com). Google adds a Meet link, sends the invitations, and the meeting appears on every guest's calendar by itself.

You only do this once. At handover, the next person only needs to know two things: who holds the BT main account password, and that the three values from step 5 live in Supabase Vault.

> ⚠ The three values from step 5, especially the refresh token, are the key to editing the BT main account's calendar. Paste them only into Supabase Vault. Never into chat, docs, LINE, or the repo.

## 1. Create a Google Cloud project

Stay signed in as the **BT main account** the whole time.

1. Open https://console.cloud.google.com, click the project picker at the top left, choose "New project", and name it `BT Site Calendar`.
2. In the left menu go to "APIs & Services" → "Library", search for **Google Calendar API**, and click "Enable".

## 2. Set up the consent screen

1. Left menu: "APIs & Services" → "OAuth consent screen" (the newer console calls it Google Auth Platform).
2. User type: "External". App name: `Beyond Taiwan Site`. Use the BT main account for the support email and the developer contact.
   On the "Branding" page, also fill in these two. Google won't let you publish the app without them:
   - Application home page: `https://beyondtaiwannpo.com`
   - Application privacy policy link: `https://beyondtaiwannpo.com/privacy/`
   - Authorized domains: add `beyondtaiwannpo.com`
3. Under "Data access" (scopes), click "Add or remove scopes" and add this one by hand:
   `https://www.googleapis.com/auth/calendar.events`
4. **On the "Audience" page, click "Publish app" so the status becomes "In production".**
   Do not skip this. If the app stays in "Testing", the refresh token expires after 7 days and the site suddenly stops scheduling meetings.
   Google will say the app is not verified. Ignore it. Only the BT main account ever signs in, so verification is not needed.

## 3. Create the OAuth client

1. "Clients" (older console: "Credentials") → "Create client" → type "Web application", name it `BT Site`.
2. Under "Authorized redirect URIs", add:
   `https://developers.google.com/oauthplayground`
3. After you create it, you get a **Client ID** and a **Client secret**. Keep that window open for the next step.

## 4. Get the refresh token

1. Open https://developers.google.com/oauthplayground
2. Click the gear icon (top right), tick "Use your own OAuth credentials", and paste the Client ID and Client secret from step 3.
3. In Step 1 on the left, paste `https://www.googleapis.com/auth/calendar.events` into the box at the bottom and click "Authorize APIs".
4. Sign in as the **BT main account**. When you see "Google hasn't verified this app", click "Advanced" → "Go to Beyond Taiwan Site (unsafe)" → Allow.
5. Back in the Playground, click "Exchange authorization code for tokens" in Step 2. Copy the `refresh_token` that appears on the right.

## 5. Store the values in Supabase

1. In Supabase project `norjaglyaotzewxavmhv`, go to Database → Extensions, search for **http**, and turn it on.
2. In Supabase Vault (under Project Settings or Integrations), add three secrets. The names must match exactly:

   | Name | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | Client ID from step 3 |
   | `GOOGLE_CLIENT_SECRET` | Client secret from step 3 |
   | `GOOGLE_REFRESH_TOKEN` | Refresh token from step 4 |

When you are done, tell whoever maintains the code. They will send a migration with a test in it: the database swaps these values for a pass from Google and reads one item from the BT main calendar. Hooking up scheduling only starts once that test says it works.

## When something breaks

- **The site says it can't reach Google Calendar**: usually the refresh token has stopped working. Common causes: someone changed the BT main account password, someone removed this app under the Google account's "Third-party access", or step 2.4 was skipped and the app is still in "Testing". Redo steps 4 and 5 and replace `GOOGLE_REFRESH_TOKEN` in Vault.
- **Someone else takes over the BT main account**: nothing to redo. The token only stops working if the password changes or access is removed.
