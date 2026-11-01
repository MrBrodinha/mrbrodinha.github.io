# Shared accounts: deployment and Supabase configuration

The app uses one Supabase client and AuthProvider for the entire origin. Brodle
stays playable as a guest. Red Bull is now private to at most two manually
enabled accounts, using `public.users.redbull_enabled`. RLS restricts access and
keeps rating updates/deletes limited to their owner. Participant-key login is
not used. Apply the later Red Bull migration and follow
[the private Red Bull guide](redbull-private.md) for access and image uploads.

## Frontend environment

Set these for local Vite and for the production build:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Use Project Settings → API Keys → **Publishable key**. Never use an `sb_secret_`
key, a `service_role` JWT, database password, SMTP password, or management token
in a `VITE_*` variable. Vite substitutes these values into public JavaScript.
Restart Vite after changing local variables; rebuild/redeploy after changing
production build variables. Keep the real `.env` untracked.

The legacy `VITE_REDBULL_KEYS`, `VITE_REDBULL_NAMES`, and
`VITE_GOOGLE_SHEETS_URL` are no longer used. Existing Sheets/local participant-key
records are not automatically reassigned to new accounts: establish ownership
before a separate import. Existing reviews are preserved.

## Database prerequisites

Review and run `database/migrations/202610310001_shared_auth_ratings.sql` in SQL
Editor once. It uses your **existing** tables:

- `public.users(id uuid, username text)` with `users_username_check` and
  the case-insensitive `users_username_unique` index on `lower(username)`.
- `public.redbull(id uuid, name, flavour, image_url, source_url)`. Legacy schemas
  include `description`; migration `0009` removes it and requires a nonblank
  flavour. See [the Red Bull migration guide](redbull-private.md).
- `public.redbull_rating(id uuid, user_id uuid, redbull_id uuid, rating smallint,
  opinion text, created_at, updated_at)` with a unique `(user_id, redbull_id)` pair.

Keep your existing Auth signup trigger: it must take
`new.raw_user_meta_data ->> 'username'` and insert `id, username` into
`public.users`. The client calls `auth.signUp` with `options.data.username` and
never inserts a profile. The trigger should use `security definer set search_path
= ''`, qualified table names, and must not copy email/password fields. Its SQL
was not supplied, so verify this contract on the live project.

Signup calls Supabase Auth directly, without a username-availability RPC or
anonymous profile-read prerequisite. The existing username unique index resolves
collisions, including concurrent signup races. A trigger constraint failure rolls
back the signup. Supabase masks database details, so the UI explains a possible
username collision without claiming every database failure means a taken name.
It adds RLS policies and column grants without replacing tables, moving rating
data, changing foreign keys, or replacing your `redbull_rating_updated` trigger.

The catalog comes directly from `public.redbull`, so ratings always use the
actual UUID. Source URLs remain available for links; no numeric-ID or name
matching is used. The old static JSON exports are now offline archives under
`tools/catalog/data/`; private Red Bull has no guest-preview fallback.

Scores follow the updated database constraint after migration `0007`: **0–10 and required**, with optional
opinions up to 2,000 characters in the UI. An opinion without a score is kept as
an unsaved draft with a validation message. Clear removes the selected score;
**Delete my rating** removes your entire saved score/opinion. Zero is a valid
rating. Existing scores are preserved without silently rescaling or importing
old Sheets data.

Only `id, username` are granted for reading profiles. The client explicitly
selects only those columns; rating queries join only `username`. RLS stays on.
Ownership policies plus restrictive guards protect insert/update/delete against
forged `user_id` values even if older permissive policies exist. The later `0006`
migration adds restrictive Red Bull access guards. Existing RLS policy SQL was
not supplied: review restrictive legacy
policies before deployment, since they can still deny a legitimate user's writes.
Do not disable RLS or give browser clients access to `auth.users`.

## Authentication dashboard

In **Authentication → Sign In / Providers** (the Email provider/settings):

- Enable **Allow new users to sign up**.
- Enable **Email** with email/password sign-in.
- Enable **Confirm email**. This is required: the server must reject login
  before verification. Client checks complement it, but cannot replace it.
- Leave anonymous sign-ins disabled; Brodle guests do not need Auth accounts.
- Set minimum password length to **8** or higher. The UI requires at least 8;
  stronger dashboard password requirements are enforced by Supabase.

Under **Authentication → URL Configuration**, set **Site URL** to:

```text
https://mrbrodinha.com
```

Add these exact **Redirect URLs**:

```text
http://localhost:5173/auth/callback
http://localhost:5173/auth/reset-password
http://127.0.0.1:5173/auth/callback
http://127.0.0.1:5173/auth/reset-password
https://mrbrodinha.com/auth/callback
https://mrbrodinha.com/auth/reset-password
```

For `npm run preview -- --port 4173`, also add:

```text
http://localhost:4173/auth/callback
http://localhost:4173/auth/reset-password
http://127.0.0.1:4173/auth/callback
http://127.0.0.1:4173/auth/reset-password
```

Vite can choose a different port when one is busy: use `--port 5173
--strictPort` or allowlist that actual port explicitly. Avoid broad production
wildcards. `www.mrbrodinha.com`, if used, should redirect to the canonical origin
**while preserving the path, query, and fragment**; otherwise it has separate
browser storage/session state and needs its own redirect entries.

This client-only SPA uses the SDK's implicit email-link flow, so confirmation
and recovery also work when the email is opened in another browser. Keep the
**Confirm signup** and **Reset password** email templates linking to:

```html
<a href="{{ .ConfirmationURL }}">Continue</a>
```

Use the full Supabase verification URL; do not replace it with a bare site URL.
Signup/resend sets `emailRedirectTo` to `/auth/callback`. Password recovery sets
`redirectTo` to `/auth/reset-password`. The SDK consumes the returned session,
and the app removes remaining fragments/errors from the address bar. Expired or
used links show a route to request a fresh email. Confirmation opens the shared
account; recovery updates the password then signs out this browser for login
with the new password. A refresh on the reset page restores the SDK session.

Your static host must serve the SPA on `/login`, `/signup`, `/account`,
`/forgot-password`, `/auth/callback`, and `/auth/reset-password`. GitHub Pages
already uses this repository's `predeploy` to copy `index.html` to `404.html`.
Keep that step (or an equivalent SPA fallback) in your publishing workflow.

## Custom SMTP: required for public signup emails

Supabase's built-in sender is intended for testing: it restricts recipients to
project-team addresses and currently limits sending to 2 messages/hour. Set up
custom SMTP before inviting public users.

1. Create an account with your chosen transactional email provider and verify
   a sending domain you control (for example, `mrbrodinha.com` or a mail subdomain).
2. Add the exact SPF/DKIM DNS records supplied by that provider. Configure
   DMARC for your domain and ensure the From address matches the verified domain.
3. In **Authentication → Email → SMTP Settings** / **Custom SMTP**, enable
   custom SMTP and enter:

   | Setting | Value |
   | --- | --- |
   | Sender email | A verified address, e.g. `no-reply@mrbrodinha.com` |
   | Sender name | `mrbrodinha` |
   | SMTP host | Your provider's SMTP hostname |
   | SMTP port | The provider's TLS-supported port, commonly 465 or 587 |
   | SMTP username | The SMTP credential from your provider |
   | SMTP password | The provider's SMTP password/API credential, dashboard only |
   | Minimum interval per user | 60 seconds (the app also shows a resend countdown) |

4. Under **Authentication → Rate Limits**, adjust email limits to your provider's
   verified capacity and expected traffic. Custom SMTP does not remove Supabase's
   other rate limits. Disable email click/link tracking for Auth messages so
   verification links are not rewritten by the provider.
5. Send a verification and recovery email to an address **outside your Supabase
   organization**. Check inbox/spam, confirm both links reach the correct domain,
   and test expired links and resend. Review Auth/email-provider logs in their
   dashboards if delivery fails; do not log credentials in application code.

The host, username, password, DNS values, and port must come from your actual
provider; they cannot be inferred from the website domain. No SMTP secret goes
in this repository or frontend environment.

## Privacy and session behavior

Email is stored privately in **Supabase Auth** for verification and recovery;
passwords are handled and hashed by Supabase Auth. The app does not copy them
into `public.users`, rating tables, custom browser storage, or application logs.
The Supabase SDK manages its own persisted session, including its Auth user
object; that SDK-managed session can contain the current user's email. The app
creates no separate email/password cache. Only public usernames appear in the UI.

All site pages share a top-left **← MrBrodinha**, **Log out**, and **Profile**
group (guests see login/signup). A shared footer contains the spinning-face GIF,
site name, and GitHub link. Usernames are shown on the profile and where needed
for author/rating credit. The styled profile card keeps its centered logout and
back arrow. The arrow returns to the originating page, retaining an opened
melody’s URL; direct visits fall back to Brodle. Brodle’s top-right navigation
groups **Create a melody**, **My melodies**, the administrator’s **Manage Brodle**,
and **Play Brodle**.

Rating drafts (scores/opinions only) use local storage scoped to Auth user ID.
They cannot carry over when another user signs in. Signing in clears stored
Brodle rounds, including guest attempts and unfinished guesses, and resets open
game tabs. Refreshing an existing session or refreshing its token does not reset
the round. The SDK session, melody-creator drafts, and account-owned rating drafts
are retained. Brodle progress is not yet synced across devices.

## Verification before release

- New signup: invalid/duplicate-case usernames fail; valid signup creates one
  Auth user and one trigger-created profile; no session before confirmation.
- Resend: confirmation arrives, old/used link errors are clear, valid link
  confirms and signs in. Refresh and open another tab: session is restored.
- Recovery: request link, open it logged out/in another browser, update password,
  sign in with the new password. Invalid/expired links offer a fresh request.
- Guests can play Brodle; Red Bull requires an enabled account.
- Confirmed, Red Bull-enabled users A and B can each save a rating for the same drink, compare
  usernames/results, edit and delete their own entries only. Test ownership via
  direct REST requests as well as the UI.
- `npm test` and `npm run build` pass. The test suite executes the migration and
  RLS smoke script in embedded PostgreSQL against a fixture matching the supplied
  schema, including a legacy permissive policy. This verifies SQL/ownership locally;
  it does not verify the live project's trigger, settings, or existing policies.

`tests/auth/fixtures/rating-ownership.sql` is a local fixture for the historical
`0001` policy tests. Current private-access checks live in
`tests/redbull/database.test.mjs`. Run both through `npm test`; these fixtures
execute in embedded PostgreSQL and do not change live data.

Sources: [password-based Auth](https://supabase.com/docs/guides/auth/passwords),
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
[SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[user management](https://supabase.com/docs/guides/auth/managing-user-data),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
