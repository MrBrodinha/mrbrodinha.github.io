# Private Red Bull Rater

## Enable the update

On an existing working installation with `0006` and `0007` applied, run only
the remaining `0009` and `0010` migrations in Supabase’s SQL
Editor. Otherwise apply `202610310006_redbull_private_entries.sql`, then `0007`,
then `202611010009_redbull_required_flavour.sql`, then
`202611010010_redbull_rating_constraint.sql`. If `0009` is already applied, run
**only `0010`**. New installations need the shared Auth/rating migration `0001` first.
Brodle’s library migrations are independent. Do not rerun applied migrations.

Migration `0006` preserves the catalog, reviews, signup trigger, and rating update
trigger, adds private access and uploads, and defaults accounts to **off**.
Migration `0007` expands the rating scale to **0–10** without rescaling existing
scores or resetting access flags, catalog entries, reviews, or images.
Migration `0009` removes the description column and its saved text, replaces the
entry RPC without its description argument, and requires a non-null, nonblank
flavour. Existing null/blank flavours become **Unknown flavour** so the catalog
stays available; replace these placeholders in Table Editor when the flavour is
known. Existing ratings, images, access flags, and RLS protections are retained.
Migration `0010` repairs a remaining legacy 1–5 rating constraint to accept 0–10,
including databases already using the description-free entry RPC.

If saving a score such as 9 fails with code `23514` and constraint
`redbull_rating_rating_check`, apply `0010` and retry the existing form. Do not
rerun `0007` after `0009`, because it recreates the obsolete description RPC.
The frontend shows a specific rating-scale message for this failure. Other
unrecognised database errors include only a safe reference code, never raw
backend messages or failing-row data.

## Choose the two accounts

In **Table Editor → public.users**, turn **redbull_enabled** on for your account
and the second account. You can turn one off and another on later. The database
rejects a third enabled account. `redbull_access_slot` is an internal field
managed by a trigger; leave it alone. Ordinary browser users cannot read or
change either field, and signup metadata cannot enable access.

Or run this SQL using the actual public usernames:

```sql
update public.users
set redbull_enabled = true
where lower(username) in (lower('YOUR_USERNAME'), lower('SECOND_USERNAME'));
```

To revoke one account:

```sql
update public.users
set redbull_enabled = false
where lower(username) = lower('USERNAME_TO_REMOVE');
```

Disable an old account before enabling its replacement. No flag or key is added
to the frontend environment. Shared Auth still works across both sites; Brodle
remains playable by guests. No emails or passwords are copied into profiles,
reviews, catalog data, custom storage, or logs.

The Red Bull page checks access on entry, on focus/visibility changes, and when
**Check access** is pressed. Database and Storage policies enforce the flag on
every request, including when an already-open page has stale UI. Disabled users
cannot browse catalog/review rows or fetch private uploads. Public usernames
remain readable for shared-account attribution.

## Add a drink and review it

Enabled users choose **Add a drink** and fill in:

- Required name and flavour, with an optional source link.
- Optional HTTPS image URL, or a JPG/PNG/WebP/GIF upload up to 5 MB.
- Required 0–10 rating and optional opinion (up to 2,000 characters).

**Add drink and save rating** commits both database rows in one transaction. A
failed first review cannot leave a partial catalog entry. The new drink and its
saved review appear immediately. Zero is a valid score; an empty selection is
separate from zero. Source links may be blank, including for multiple entries. Creation uses the current Auth ID; clients
cannot supply another author. The same request ID can be retried without a
duplicate. Duplicate source links show a useful error instead of overwriting an
existing drink. Existing review editing, deletion, sorting, and per-account
browser drafts remain available. Only rating owners can edit/delete their reviews.
Results load automatically. **Save drink** saves only that card; other unsaved
ratings stay as drafts. If ratings fail to load, **Try again** retries the load.
Both rating pickers keep 0–10 on one line and scroll horizontally on narrow
screens; **Clear** sits beside the card's rating label.

Direct client inserts/updates/deletes on the catalog are denied. Catalog changes
outside this creation flow remain manual database administration.

## Images

The migration creates the **private** `redbull-images` bucket with a 5 MB limit
and allowed MIME types `image/jpeg`, `image/png`, `image/webp`, and `image/gif`.
Supabase Storage must be enabled, and its project-wide upload limit must allow
5 MB. No public bucket setting, service-role key, or frontend bucket-creation
permission is needed.

Uploads are scoped to the current user and entry, with content hashes in their
paths. Existing images cannot be overwritten. Enabled accounts can view each
other’s uploaded drink images via authenticated downloads. The UI uses temporary
blob URLs and releases them on unmount; no public or long-lived signed URLs are
stored in the table. External image links remain on their original external
hosts and may be publicly accessible there.

If saving fails, the client attempts to remove its unreferenced upload. Storage
RLS prevents deleting any image referenced by a committed drink. An interrupted
upload/cleanup may leave an unreferenced object; an administrator can remove it
in Storage. If uploading fails, the form stays filled and offers image URLs as
an alternative. URL-only entries do not depend on uploads working.

The old static JSON catalog exports were moved out of `public/` into
`tools/catalog/data/`; they are retained as local archives and are no longer shipped
as a public catalog fallback.

## Verification

`npm test` checks both the original Auth migration and the new private-access
migration in embedded PostgreSQL. New checks cover the two-account cap,
non-escalation, restrictive guards over legacy permissive policies, atomic
creation and retries, rating ownership, private upload paths, image cleanup,
and access revocation. Browser checks use mocked API/storage responses and real
local UI. Apply this migration and confirm access/uploads in the actual Supabase
project before publishing; local checks do not change live settings or data.

Supabase references: [standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads),
[Storage RLS](https://supabase.com/docs/guides/storage/security/access-control),
[bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets).
