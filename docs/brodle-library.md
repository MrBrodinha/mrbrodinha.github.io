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
10. `database/migrations/202611020015_brodle_note_hints.sql`
11. `database/migrations/202611110016_brodle_triplets.sql`
12. `database/migrations/202611130017_brodle_hint_mode_lock.sql`

If Brodle is already set up through `0016`, run **only `0017`** before deploying
this frontend. It saves challenge-song hint usage without letting stale devices
or older clients erase it, preserving the immediate Casual mode lock across devices.
Migration `0016` validates complete eighth- and quarter-note triplets in challenge
and victory parts. Migration `0015` saves revealed notes and each attempt's hint count to the account,
preserving hints when older tabs or other devices save progress. Migration `0014`
allows administrators to return approved melodies for editing.
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
confirmed account. The editor includes title, source/artist, key, BPM,
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

## Triplets

Choose **Triplet ③** beside Dotted, then **Eighth** or **Quarter**. Enter three
notes or rests; **Triplet: 1/3** and **2/3** show the group's progress. Three eighth
triplets take one quarter-note beat; three quarter triplets take two. The score
shows a 3 over the group, and normal entry resumes after its third entry.
Dotted is disabled while entering or editing a triplet.

In victory parts, build each chord with the piano, then use **Done with chord** to
advance to the next entry. A whole chord counts as one triplet entry; adding or
removing its pitches does not advance the group. **Hear chord** previews one normal
quarter note, including when the selected entry is a triplet.

Select any member to change pitches or replace it with a rest. Changing its
duration updates all three members. Undo can reopen the last triplet. Unfinished
groups survive browser reloads; **Finish with rests** fills their remaining entries.
Turning Triplet off during an unfinished group also fills it with rests. Finish
each group before copying code or saving/submitting/scheduling to the account.

For this first version, finish a dotted 32nd subdivision before starting a triplet:
the notation renderer cannot draw the 128th-note ties that an offset group could
need at a bar line. The Triplet control explains this when unavailable.

Code and cloud data retain the written `beats` (`.5` or `1`) plus `triplet: 1`,
`triplet: 2`, and `triplet: 3` on three consecutive entries of the same duration.
Playback applies the 3:2 ratio, and timing/bar calculations use integer ticks.
Unmarked notes and existing published snapshots keep their original timing.

The code field is editable. Change the exported constants, then press **Apply
code** to validate and update the score and browser draft. Title and source
are retained, along with any legacy hint metadata. `midi` and `beats` define each entry; `length` and `rhythm` are
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
duration. **Hear chord** previews the selected entry with all its pitches together,
for one normal quarter note at the victory tempo, using the chosen piano sound
and volume. The preview length is independent of the entry's written duration.
The speaker button switches to **Stop preview** during playback. It also works while building
a chord, as soon as the first pitch is selected.
The Chords button highlights while active; **Done with chord** finishes the entry
and returns to normal note input. To start another chord,
turn Chords on again. Notes appear immediately; no helper panel or extra chord
text is displayed. **Play full melody** above the score plays the whole challenge;
**Play full victory** plays both victory parts together.

Select an existing chord on the sheet to adjust it immediately. Duration and
Dotted controls update the selected entry. Switching parts keeps the notes
already entered. Rests switch chord mode off and can be placed independently in
each part. Undo and Clear part retain the other part. Blank staff space does not
insert notes, and dragging is disabled.

Both parts begin at beat zero, with their own rhythm. Use rests to delay entry.
**Play full victory** plays both parts together and ends after the longer
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

In **Casual**, an exact melody or a consistent shift of the whole melody to a
different pitch or octave finishes the round. The full victory arrangement
plays automatically at the winning pitch: the same semitone offset applies to
the main part, every chord member, and the bass, with rests and timing preserved.
The player can replay it in that pitch after a reload too. **Hard** requires
every note at the exact pitch and octave; shifted melodies receive normal
higher/lower feedback and do not win. Its victory arrangement uses the original
authored pitches. While victory music plays, the keyboard fits all pitches from both
parts, including every chord member, between the lowest and highest sounding
notes. A black-key lower endpoint extends down to the adjacent white key; a
black-key upper endpoint extends up to the adjacent white key. White endpoints
stay exact. The entire keyboard fits within the available width during playback,
with dense note labels hidden on small screens. Stopping or finishing playback
restores the normal challenge keyboard.
During victory playback, all visible keys have their normal
black/white appearance, including transposed notes below or above the guessing
range. Guessing limits apply again after playback ends.
Every winning guess scrolls to the top to show the result (without animation
for reduced-motion preferences). Casual retains its shifted/octave feedback
colors. Hard shows only exact, higher, and lower feedback; its legend, tutorial,
and shared results never label a shifted/octave submission as a win.
Extreme victory transpositions keep their actual pitches, including outside the
normal keyboard range; pitches outside a sampled instrument's MIDI map use Synth.

Brodle's top bar centers its note icon, name, and melody tagline, with **Menu** on
the left and login, signup, profile, and logout controls at the top right.
The opened sidebar places **← MrBrodinha** immediately below the **Brodle menu**
heading, followed by Create a melody, My melodies, Manage Brodle (for admins), and
Brodle. The sidebar starts closed and smoothly makes room by
narrowing the page beside it, keeping the game interactive. The Menu toggle,
Close button, or Escape closes it. Reduced-motion preferences disable the
animation. Mode, help, sound, and note-label controls stay on the main page.

Choose **Casual** or **Hard** before submitting the first guess or using a hint.
The first submission locks the selected mode. **Add note** and **Play song**
immediately lock the puzzle to Casual, before playback or account saving finishes.
The switch is replaced with the selected mode and **Mode locked**,
including after a reload or account restore. Mode selection is scoped to the
player, puzzle, and target so playing another day does not change an ongoing
round's mode. Account restore checks for a round locked by a submission or hint in either mode
before exposing a new choice. Casual is the default for new rounds.
Unsuccessful submissions start a fresh draft, retaining revealed hint notes. A win ends guessing and leaves playback and free play available.
One box shows **Your attempt**, the feedback legend, and
the latest submitted sheet, followed by **Your guess** and the
new draft. Older attempts remain saved without adding more sheets. Use
**Previous** and **Next** to view them; each score wraps to the available width
and grows with its content, without a scrollable attempts area.
**Copy last attempt** fills the draft without spending an attempt and
preserves revealed notes and, in Casual, previously confirmed correct pitches.
The song title, source/artist, and contributor credit are visible above the workspace from the start in both modes. Players reconstruct the notes and octaves; rhythm and rests are supplied. The draft heading has Your guess on the left and Listen on the right. Remove last note, Clear, and Submit sit below the sheet, with Clear immediately before Submit. Backspace also removes the last note. The sheet shows its key signature and tempo directly.

The existing separate mode records retain their own attempts, partial drafts,
hint counts, and solved states. Older players with history in both modes keep
the mode they most recently selected for that puzzle. The browser remembers the
preferred mode for new puzzles, and signed-in players restore an already-started
mode on another device. Existing shared history stays in Casual.
Hard keeps every playable pitch available. Previously correct notes are
not locked in Hard. Casual offers separate note-reveal and challenge-song
playback controls. Hard has neither control. Previously revealed notes and their
hint counts are preserved in existing rounds in both modes.
Normal submission feedback and playback of the player's guesses remain available.
Saved mode preference values remain `guided` (Casual) and `classic` (Hard) so
existing browser preferences and Casual rounds continue to work.

Casual retains learned pitch limits independently for every note position.
For the selected position, a too-high pitch and everything above it become
unavailable on the piano; a too-low pitch and everything below it do too.
The same limits apply when entering the next note in a fresh draft, selecting
a draft note, or editing a copied attempt. Clearing, undoing, and reloading do
not reset these limits. Confirmed green notes stay correct when their positions
are filled or copied. Other draft notes are neutral until submission; the last
submitted sheet retains its feedback colors.
After choosing a replacement, selection advances to the next editable existing
note, skipping locked notes, and clears after the last one. Copied incorrect
notes must be changed into their remaining ranges before submitting again.
Octave and shifted-melody wins keep their special feedback and result and end
the Casual round immediately. Copying attempts into a draft and further
submissions are unavailable after any win. Disabled keys use a pale blue tint
so they remain distinct from playable black keys.

**Free play**, to the left of **A–G / Dó–Si**, lets players try any playable key
in the displayed piano range
without adding or replacing notes or submitting attempts.
Turning it off restores the selected note and its accumulated pitch limits.
The switch stops any active sound when changing modes. Backspace cannot erase
the draft while free play is on.

Attempts and hint counts are retained for sharing, account sync, and restoring
pitch limits after a reload. Saved partial drafts remain partial and do not
fill missing positions from their latest attempt.
Written clues remain removed from the game, studio, and library. The title and
artist stay visible in both modes. Casual offers two independent hint controls:

- **Add note** reveals the next correct note permanently, up to half the melody's
  sounding notes rounded down. The counter shows note hints used and the limit.
  Adding a note never starts challenge-song playback, including the final hint.
- **Play song** plays the challenge melody with its authored rhythm and tempo.
  It is available immediately, even on puzzles too short for note hints, and can
  be replayed after exhausting the note budget. It neither changes the draft nor
  spends a note hint. **Stop song** stops playback. Target keys are not highlighted
  or scrolled into view during this playback.

Both controls are hidden in Hard mode and after a win. Existing note hints and
per-attempt hint counts remain compatible with browser and account progress.
Song hint usage is saved separately from the note budget. Stopping playback,
clearing the draft, reloading, and stale tab/device saves do not unlock the mode.
Listening to the player's own draft or using free play does not lock it.
Shared results identify the mode and show note hints used when greater than zero.

**How to play**, beside the mode switch, opens a guided tour on the actual page.
The current area gets a numbered outline while the rest of the page dims. Each
step scrolls its control into view and positions a short help card beside it,
or above/below it on phones. The tour covers the song, difficulty, mode, staff,
piano, sound/free-play settings, Casual hints, and submission controls. History
appears once there are attempts; completed rounds show results and skip hidden
draft/hint/submission controls. Hard rounds skip the Casual-hints step.

Players can use Back/Next, left/right arrow keys, or the numbered step buttons.
Escape and Close exit; closing restores the previous scroll position and focus
to the help button. The native modal keeps page controls inert, focus stays in
the tour, and game editing shortcuts cannot change a guess while it is open.
Opening stops audio but never uses hints, submits a guess, or changes/locks the
mode. Highlights track scrolling and resizing. The help button keeps a visible
label on phones and can reopen the tour at any time.

The tour's **Try a hands-on example** link and the menu's **Learn to play** link
open `/brodle/tutorial`, a separate interactive practice page. Three lessons
teach entering a shown four-note melody, repairing a seeded higher/lower example,
and reconstructing a new melody by ear. The page reuses the real piano, notation,
Casual scoring, note constraints, hints, and attempt history. Players can jump
between lessons, restart, or return to the daily puzzle. Lesson changes scroll
and focus the new instructions into view. Note examples follow A–G/Dó–Si settings.

Practice progress lives only in the page's React state and resets on leaving.
It does not load or save daily/account rounds, spend their hints, or lock their
mode, and requires no sign-in or database migration.

The **Today's puzzle** link is shown only when viewing another date. It stays
hidden on today's puzzle even when opened using an explicit `?date=` URL.
The server's Lisbon date determines whether the selected puzzle is today.

The game piano uses the smallest range of complete C-to-C octaves containing
the melody, with at least one octave. C5–C6 uses C5–C6 (one octave); C5–B6
uses C5–C7 (two octaves). G4–G6 uses C4–C7. Boundary Cs are included without
adding an extra octave. On phones, each page includes its closing C, and the
final C does not create a separate octave page.
Both ends are always white keys, including melodies at the edges of the playable G1–G7
range. Framing keys outside that playable range are disabled.
Studio keeps its full keyboard. Clear appears before Submit guess in every draft.
The victory parts do not add notes to the guessing target. My melodies and admin
review show the victory score and can play the full arrangement.

Sampled instruments retry a failed load once, reusing samples already downloaded.
If an instrument still cannot load, piano keys and melody playback use Synth
automatically. A notice identifies the selected instrument and the fallback.
**Retry sound** restores the selected instrument when it becomes available;
**Use Synth** selects Synth and clears the notice. Game progress is unaffected.

Phones and tablets start with **Synth**, ready immediately without sample
downloads. Desktop browsers start with **Grand piano**. All devices can still
select another instrument from the sound controls.

Switching tabs, moving focus to another window, or opening another app no longer
stops a melody or victory arrangement. Held piano keys are released on focus loss
to avoid stuck notes. Stop controls still stop playback. Navigating away from the
Brodle screen or closing/reloading its tab ends playback. A mobile browser or the
operating system may still interrupt background audio, especially on screen lock.
On returning to Brodle, interrupted playback attempts to resume in place. Its
controls and key highlights follow the audio clock even if that clock was paused.

## Automatic difficulty

The game, melody cards (including My melodies and admin review), and Studio show
an estimated **Easy**, **Medium**, or **Hard** rating. Studio updates it as the
challenge melody changes. Empty or rest-only drafts have no rating.

`src/components/brodle/lib/melodyDifficulty.ts` computes the initial rating from
the sounding challenge notes. Each factor contributes 0–2 points:

| Factor | 0 points | 1 point | 2 points |
| --- | --- | --- | --- |
| Note count | Up to 8 | 9–16 | 17 or more |
| Unique MIDI pitches (including octave) | Up to 4 | 5–8 | 9 or more |
| Pitch span, lowest to highest | Up to 7 semitones | 8–12 semitones | More than one octave |
| Interval jumps | Average ≤2 and largest ≤4 semitones | Average ≤4 and largest ≤7 semitones | Either exceeds the middle limits |

Totals **0–2 = Easy**, **3–5 = Medium**, **6–8 = Hard**. The interval factor uses
the higher score from average and largest absolute jumps between consecutive
sounding notes, even when separated by a rest. Repeated notes have zero jump.

Rests, durations, tempo, key signature, and victory parts do not affect this
rating. Transposing a melody preserves its rating; octave range uses actual
pitch span rather than the number of octave labels crossed. The estimate is
independent of Casual/Hard mode, hints used, and player progress. It does not
change game rules or automatically choose a mode.

Ratings are derived when displayed, so existing stored melodies and published
challenge snapshots work immediately without a database migration or resaving.
These initial thresholds are a heuristic; player-performance calibration is
not included.

## Review and schedule

Administrators can see submitted, approved, and returned melodies, with author,
source, music settings, sheet preview, playback, and **View melody code**.
The code preview uses the same export as Studio, including music settings,
challenge notes, and any victory melody/bass parts. Line numbers and **Copy code**
help reviewers describe exact changes in the review note; returning the melody
lets its creator apply those changes to the original. Review notes preserve line
breaks so snippets remain readable. Administrators cannot browse
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

Progress is stored by **account, challenge ID, mode, and target pitches**. Different
days and modes have independent rounds. Signing out no longer deletes attempts; signing back
into the same account restores its attempts, current sheet, pitch limits,
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
remain guest Casual rounds; they are not silently assigned to a signed-in account.
Account caches use `brodle:progress:v2:user:<user ID>:`. Hard uses a `hard:` prefix
on the challenge ID in both browser keys and account load/save requests, keeping
the two rounds separate with the existing database schema and RPCs. No additional
migration is required for mode separation. No email/password fields
are stored in player progress; feedback is recomputed from the target on restore.

## Past days

Below the game, **Play other days** has Earlier/Later arrows. They
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
