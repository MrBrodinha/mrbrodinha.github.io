# Melody Studio, submissions, and daily challenges

## Enable the feature

The frontend is implemented locally. Run the migrations in order, once each in your
Supabase project's SQL Editor:

1. `database/migrations/202610310002_brodle_library.sql`
2. `database/migrations/202610310003_victory_parts.sql`
3. `database/migrations/202610310004_piano_range.sql`
4. `database/migrations/202610310005_delete_approved_melodies.sql`
5. `database/migrations/202611010008_brodle_archive.sql`
6. `database/migrations/202611010011_brodle_demisemiquavers.sql`
7. `database/migrations/202611010012_brodle_victory_settings.sql`
8. `database/migrations/202611010013_brodle_player_progress.sql`
9. `database/migrations/202611010014_brodle_return_approved_melodies.sql`

If Brodle is already set up through `0013`, run **only `0014`** before deploying
this frontend. It allows administrators to return approved melodies for editing.
Migration `0013` adds private, account-owned player progress and the load/save
functions. Migration `0012` adds separate victory BPM/key fields to melodies and
newly scheduled snapshots; `0011` enables demisemiquavers (32nd notes and rests),
including dotted variants. Apply any missing Brodle migrations in order.
Existing rows and schedules are preserved. Red Bull migrations are independent.

It uses your existing `public.users(id, username)` and Supabase Auth setup. It
creates only Brodle tables/functions and does not change Red Bull ratings or
create another profile trigger. Do not rerun a migration already applied.

Then grant your account Brodle administrator access in SQL Editor, replacing the
username with your actual public username:

```sql
insert into public.brodle_admins (user_id)
select id from public.users
where lower(username) = lower('YOUR_USERNAME')
on conflict (user_id) do nothing;
```

Check that one row was inserted (or already existed). This role is assigned
only through trusted database administration. Users cannot promote themselves,
and the frontend never contains a secret/service-role key. Log in or reload to
refresh the admin controls. To revoke access:

```sql
delete from public.brodle_admins
where user_id = (select id from public.users where lower(username) = lower('YOUR_USERNAME'));
```

After the normal frontend deployment, the routes are:

- `/brodle/create`: browser drafts, cloud saving, submissions, and direct
  scheduling for administrators.
- `/brodle/melodies`: the signed-in user's saved drafts and review results.
- `/brodle/admin`: the administrator's submission inbox and daily calendar.
- `/brodle`: guest-accessible daily game.

Keep the static host's SPA fallback for these routes. The existing Supabase
URL/publishable-key environment variables and Auth confirmation/reset redirects
are reused. No new email provider or scheduled job is required for daily games.

## Author workflow

Guests can compose and export code, with the current draft saved in their
browser. Logging in retains that composer draft. Cloud saving requires a
confirmed account. The editor includes title, source/artist, hint, key, BPM,
time signature, and two sections: challenge melody and optional victory arrangement.
The challenge stays monophonic and is the only part players guess. The victory
arrangement has a main part and an optional bass/second part, each with its own
treble/bass clef. An empty main part reuses the challenge melody.

**Set the feel** has separate **Challenge melody** and **Victory melody** key
and BPM controls. The victory settings apply to both its main and bass parts,
including when the main part reuses the challenge notes. The time signature is
shared. Key signatures control notation; MIDI pitches stay as entered. Preview,
browser autosave, cloud saves/copies, and newly scheduled challenges retain both
settings. Older drafts and published snapshots without victory settings inherit
their original challenge BPM/key.

**Save draft to account** creates a private cloud draft; subsequent saves while
editing its URL update the same record. My melodies opens that record on any
device. **Submit for Brodle** saves the latest content and sends it for review.
Submission requires a title and at least one pitched note. A submitted version
is locked. Authors can make an editable copy; returned drafts can be edited and
submitted again. Authors can delete their own drafts, returned records, and
approved melodies from My melodies. Administrators can also delete approved
melodies from Manage Brodle’s Approved list. Submitted records remain locked.
Deleting a source keeps all scheduled copies, including published challenges;
their source reference becomes null, while snapshots and dates remain intact.

Browser autosave remains a recovery draft, not automatic cloud publication.
**Create a melody** links and the **New melody** button open a blank composition,
with empty parts and default key, tempo, and meter. Saved cloud melodies are
unchanged. The one-time new-melody action is consumed, so refreshing during
composition still restores the current browser draft. **Edit/View melody** loads
the chosen cloud record; **Duplicate** creates an editable copy.

Code export remains available,
including `FINAL_BPM`, `FINAL_KEY`, `MELODY_FINAL`, `MELODY_FINAL_BASS`, `FINAL_CLEF`, and `FINAL_BASS_CLEF` when applicable. Auth emails/passwords are
never copied into these tables. Author credit comes from `public.users.username`.

Click a note or rest on the sheet to select it, then use the piano and duration
controls to replace it. **Dotted** updates the selected entry. **Delete → rest**
(or Delete/Backspace while a score entry has keyboard focus) replaces it with a
rest of exactly the same duration. Tied fragments select the same original entry;
clicking the other staff selects that victory part. **Done editing** resumes
appending. **Undo last note** always removes the last entry in the active part,
including after a browser refresh or cloud load; it does not undo arbitrary edits
or restore a cleared part. Display-only padding rests cannot be edited.

The code field is editable. Change the exported constants, then press **Apply
code** to validate and update the score and browser draft. Title, source, and hint
are retained. `midi` and `beats` define each entry; `length` and `rhythm` are
recomputed. Optional victory arrays can be omitted to remove those parts. The
parser accepts literal data and comments, never executes JavaScript, and rejects
invalid pitches, durations, chords, or settings without altering the draft.
`FINAL_BPM` (20–400) and `FINAL_KEY` set the victory tempo and key independently;
omitting either inherits the matching challenge setting for older code.
**Reset code to score** discards unapplied text. Apply or reset pending code
before cloud saving/submitting/scheduling. Only applied changes are autosaved.

## Victory parts and chords

In Studio, select **Victory melody**, then **Main part** or **Bass / second
part**. Choose the clef for that part. Both the challenge and victory keyboards include G1–G7
(MIDI 31–103), including every chromatic note in between. Clefs change notation, not the sound's octave.

In the piano section, turn on **Chords** and tap keys to build the selected
entry. Every change appears on the sheet and is saved to the browser draft
immediately. A single pitch is a note; 2–8 pitches become a chord. Tap a selected
key again to remove it. Removing the final pitch leaves a rest of the same
duration. The Chords button highlights while active; a compact **checkmark** beside
it confirms the entry and returns to normal note input. To start another chord,
turn Chords on again. Notes appear immediately; no helper panel or extra chord
text is displayed.

Select an existing chord on the sheet to adjust it immediately. Duration and
Dotted controls update the selected entry. Switching parts keeps the notes
already entered. Rests switch chord mode off and can be placed independently in
each part. Undo and Clear part retain the other part. Blank staff space does not
insert notes, and dragging is disabled.

Both parts begin at beat zero, with their own rhythm. Use rests to delay entry.
**Play victory arrangement** plays both parts together and ends after the longer
part, including trailing rests. The score pads the shorter staff visually with
rests without changing the stored composition. Key signatures, accidentals,
dotted values and ties work for chords on both clefs.

A chord is stored as `{ "midi": 60, "pitches": [60,64,67], "beats": 1.5 }`.
The root `midi` equals the first pitch; pitches are sorted, unique and limited to
2–8. Single notes/rests retain the old shape. `final_bass_notes`, `final_clef`,
and `final_bass_clef` accompany `final_notes` in cloud records. `final_bpm` and
`final_key_signature` store the independent victory settings. Newly scheduled
snapshots include both parts/clefs and `finalBpm`/`finalKey`; existing snapshots continue to play exactly
as before. The migration does not rewrite them.

The victory arrangement is a surprise unlocked only by an exact-pitch win,
including the correct octave. It plays automatically on that win, and the player
can then replay it. Every winning guess, including shifted and different-octave
guesses, scrolls to the top to show the result (without animation for
reduced-motion preferences). Shifted and different-octave guesses play back only the guess
and show a prominent prompt to find the right pitch and unlock the surprise.
An up/down arrow indicates whether the latest correctly shaped melody is too
low or too high. Octave guesses suggest a higher/lower octave; shifted guesses
suggest moving the whole melody higher/lower. Each past attempt keeps its own
direction hint in the history, without revealing the exact interval.
The victory parts do not add notes to the guessing target. My melodies and admin
review show the victory score and can play the full arrangement.

## Review and schedule

Administrators can see submitted, approved, and returned melodies, with author,
source, hint, music settings, sheet preview, and playback. They cannot browse
other users' unsubmitted private drafts. Approve a submission or return it with
a review note. In **Approved**, **Return for editing** changes the original to
**Returned** and includes the optional review note. Its author can open
**My melodies → Edit melody**, save changes, and submit it again. Only an
administrator can revoke approval; authors cannot approve or return their own
records without that role. Returned melodies cannot be newly scheduled until
approved again (administrators may still schedule their own drafts directly).
Existing scheduled and published copies keep their dates and original content;
to use a revised version on a future date, cancel that future copy and schedule
the newly approved version. **Edit a copy in Studio** creates an independently owned draft,
without modifying the contributor's version.

The calendar shows scheduled and open days. Select an approved melody and a
date to schedule. Administrators can also schedule their own drafts directly in
Studio, which approves them as part of the scheduling transaction. A database
unique constraint allows only one challenge per date. A duplicate date fails
without replacing its existing challenge.

Scheduling stores a full snapshot, including notes/rests, optional ending/accompaniment and clefs,
settings, title, source, hint, and author credit. Later source edits cannot
change it. Future challenges can be moved or cancelled. Today's and past
challenges are locked, preserving their identity and players' scores.

## Daily selection

The reset timezone is **Europe/Lisbon**, including daylight-saving changes.
`get_daily_brodle()` uses the database's current time; users cannot select a
future date by changing their browser clock or passing a date argument.

The public endpoint returns the most recent challenge dated today or earlier,
plus server time and the next Lisbon midnight. Future schedules and private
melodies are not publicly readable. The game reloads the selection at midnight,
on tab focus, and when the page becomes visible again. The old round's audio is
stopped when a new challenge mounts.

Calendar gaps keep the last published challenge **with its original date and
ID** and label it as the latest published challenge. This does not award a new
round for the empty date. Before the first scheduled challenge (or if the
service is unavailable on initial load), the original built-in tune remains a
clearly labelled practice game. A temporary fetch failure after a daily has
loaded keeps that current daily and its progress instead of replacing it.

Progress is stored by **account, challenge ID, and target pitches**. Different days
have independent rounds. Signing out no longer deletes attempts; signing back
into the same account restores its attempts, unfinished guess, selected attempt,
and solved state. A changed target starts a separate round. Authentication is
restored before showing a round, and changing accounts mounts that user's round.

Signed-in progress has an immediate browser backup and syncs to Supabase. Other
devices restore the account's saved round before accepting guesses. The game
shows **Saving your progress…** or **Progress saved to your account**. On a sync
failure, browser progress remains playable and pending saves retry on focus,
reconnection, every 30 seconds while visible, or the Retry button. An interrupted
save can resume from the account's browser backup on the next login. Wait for
the saved status before relying on a different device to have the latest edits.

Stable attempt IDs and an atomic, row-locked save function merge submissions
from stale tabs/devices without erasing history or duplicating retries. Solved
rounds cannot be reset by an older save. Requests include the owner ID and are
cancelled when leaving a puzzle/account, protecting against late responses.

Guests retain browser-only progress. Existing unowned `brodle:progress:v1:` rounds
remain guest rounds; they are not silently assigned to a signed-in account.
Account caches use `brodle:progress:v2:user:<user ID>:`. No email/password fields
are stored in player progress; feedback is recomputed from the target on restore.

## Past days

Below the piano, **Want to play other days?** has Earlier/Later arrows. They
move between published puzzles, skipping gaps in the calendar. The oldest and
newest published days disable the unavailable direction. **Today’s puzzle**
returns to the automatically updating daily selection.

Archived games use `/brodle?date=YYYY-MM-DD`. Refreshing, browser Back/Forward,
and shared result links keep that day selected and restore its own saved progress.
An explicitly selected day stays selected across midnight. Missing or future
days display an unavailable message instead of a different puzzle.

`get_brodle_day(p_date)` returns one published snapshot and its nearest published
neighbours. Both guests and signed-in users may call it. The server uses Lisbon
time to exclude future snapshots and dates, even when the requested date is in
the future. Direct access to the schedule table remains protected by RLS.

## Tables and permissions

- `brodle_melodies`: draft content, public username credit, review state, dates.
  Notes are JSON arrays of `{ "midi": 60, "beats": 1.5 }`; `null` MIDI means a
  rest. Labels and ABC durations are generated in the app. The database validates
  supported pitches/durations, key, meter, tempo, and array lengths. Chords and bass-range notes are accepted only in victory parts.
- `brodle_daily_challenges`: date, source melody ID, immutable snapshot, scheduler.
- `brodle_admins`: administrator UUIDs; no browser writes or table reads.
- `brodle_player_progress`: private attempts, stable attempt IDs, unfinished guess,
  and selected attempt, keyed by user/challenge/target. RLS permits only the owner
  to read or write; guests and other accounts have no access. The load/save
  functions use the caller's permissions and verify the supplied owner ID.

RLS and column grants enforce ownership and protect review/status fields.
Submission, review, scheduling, movement, and cancellation use narrowly scoped
functions that check `auth.uid()` or administrator membership. The public daily
function returns only released snapshots. All security-definer functions use an
empty search path and qualified table references.

## Checks

`npm test` includes embedded PostgreSQL tests for private drafts, forged owners,
self-promotion, invalid notes, review permissions, snapshots, hidden future
schedules, date conflicts, published locks, and gaps. Music tests check persisted
metadata, canonical notes/rests, dynamic targets/settings, and Lisbon DST dates.
Progress checks cover sign-out/sign-in restoration, another device, guest/account
isolation, offline retries, slow saves, stale histories, solved rounds, late
responses, malformed payloads, and database ownership enforcement.
`npm run build` checks TypeScript and produces the production bundle.

Local SQL tests use fixtures, not the live database. After applying the migration
on your project, test with an ordinary author and your admin account: save, submit,
review, schedule, guest-play, move/cancel a future day, and verify a second user
cannot read or edit private drafts. Live email/Auth settings remain those in
[the shared account guide](supabase-auth.md).
