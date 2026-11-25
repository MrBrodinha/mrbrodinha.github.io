# mrbrodinha.com

Personal website built with React, TypeScript, and Vite.
Use the current Node 24 LTS release (`.nvmrc`).

```sh
npm install
npm run dev -- --port 5173 --strictPort
npm run lint
npm test
npm run build
npm run security:check
```

Copy `.env.example` to `.env` and set the Supabase URL and publishable key.
Keep credentials out of version control. The Supabase client and shared account
provider are required for accounts, cloud melodies, and Red Bull ratings.

## Project layout

```text
src/
  App.tsx                   Routes and lazy page imports
  App.css                   Global styles only
  auth/                     Shared account UI, context, and session handling
  components/
    home/                   Landing page
    layout/                 Shared header, footer, and navigation
    brodle/
      components/           Piano, sheet music, icons, and game UI
      creator/              Melody Studio and code/draft editing
      admin/                Submission review and daily calendar
      library/              My melodies and shared library UI
      hooks/                Audio, saved progress, and daily challenge loading
      lib/                  Music rules, notation, sounds, and data conversion
      services/             Cloud melody requests
    redbull/                Drink catalog, reviews, and entry/image uploads
    mvg/                    MVG page
    wildlife/               Crazy Wildlife player wrapper
    testing/                Administrator-only experimental feature hub
  lib/                      Shared service clients
public/                     Assets published with the website
  CrazyWildlife/            Original Unity player and build
  media/                    Spinning-face GIF
  mvg/                      MVG logo
database/migrations/        Ordered SQL history used by database regression tests
tests/                      Auth, Brodle, and Red Bull checks, grouped by feature
tools/catalog/              Original offline scraper, source data, and drink images
tools/security/             Publication guard for secrets and private files
archive/                    Original melody reference and optional prototype ZIP
docs/                       Account configuration and feature guides
```

Page styles live beside their components. Tests run locally; database checks use
embedded PostgreSQL and never modify the live Supabase project. Keep migration
history for reproducible setup and upgrade tests; do not rerun already-applied SQL.

The offline catalog tooling does not feed the website or run during builds.
Its Python scripts resolve files relative to their own directory and need
`requests` and `beautifulsoup4`. Catalog snapshots and original images are kept
for reference; the duplicate scraped snapshot was removed.

## Melody Studio and Testing

`/brodle/create` is the sheet-based Melody Studio, within the existing Brodle
header and left menu. Profile and logout stay in the shared header. Guests can
compose locally; signed-in authors can save and submit. The protected
`/testing/sheet-editor` preview shares this implementation. `/testing` remains an
administrator-only hub, accessible from Manage Brodle.
Melody Studio adds Title and Source / Artist, with independent Game melody and
Victory melody scores, selection, history and editable code. Switch between the two
using the tabs aligned to the left above the sheet workspace. Game melody uses
exactly one staff in Treble clef. Victory melody plays after a win; leaving it empty
reuses Game melody. Both applied scores and unapplied code are backed up on
each change in account-scoped browser storage. Signed-in authors autosave to their
account every five seconds when changed; Save now also saves immediately. Submitted
versions lock until an administrator returns them with feedback. Reopen Studio
drafts and returned reviews from My melodies. Studio records open at
`/brodle/create?id=…`; duplicate links use `?copy=…`. Older records retain the
previous editor at `/brodle/create/classic`, including its existing browser draft.
When that browser draft contains work, Studio offers a link to reopen it.

Apply `database/migrations/202611250018_melody_studio_documents.sql` after earlier
Brodle migrations to enable cloud Studio saves. The migration adds private, lossless
source documents and optimistic saves to the existing melody library. It does not
rewrite existing melodies or daily snapshots. Unsupported notation is retained in
drafts and explicitly blocks submission until Brodle can represent it.

The dark studio layout groups musical icon controls above a
centered score, with compact zoom and reverb controls beside it. A collapsed
Piano panel above Melody code and Help and shortcuts reuses the game keyboard:
Free play, A–G or Dó–Si names, volume and mobile octave controls. Studio always
requests Grand piano on every device; if its samples cannot load, Synth plays
automatically as a backup. The instrument is fixed rather than selectable. With Free play off,
keys enter notes at the Write caret or replace one selected note/rest in Edit.
Keys use their exact sounding pitch, preserve the selected duration, and create
one Undo step. Free play and locked-editor auditions do not alter the draft.
Closing the panel stops its audio; the piano shares the editor’s instrument,
volume and reverb. Score playback and note/chord auditions remain.
The left menu's Create a melody action starts a new draft; its one-time `new=1`
parameter is consumed so refreshing restores subsequent edits. Studio recovery
is scoped to each account (or guest). The previous editor's browser draft is kept
separately and is not automatically imported or overwritten.

**How to compose** opens a guided spotlight tour of the editor. It explains the
real controls, temporarily reveals Piano and code, and restores the workspace
when closed. Brodle's **How to play** tour follows the current exact-note and
hint rules. The separate hands-on example is removed; old `/brodle/tutorial`
links now open the game tour.

Five glyph buttons expose sixteenth, eighth, quarter, half and whole values.
**Notes / Rests** switches their symbols while preserving duration and entry dots.
In **Write**, the buttons set the next entry; Rests writes actual silence, carrying
later music when necessary. In **Edit**, Notes/Rests converts the selected event
immediately while retaining its value and dots. Rest-to-note uses the entry pitch;
Undo restores the original chord or rest. **Dotted** always shows a quarter note
with an augmentation dot, independent of the selected value or Notes/Rests mode.
Both the button and **.** change next-entry dots
in Write, even with a recent note selected, and the selected event's dots in Edit.
Accidentals expose only **Sharp, Flat, Natural**, with Natural selected by default.

**Play / Stop, Undo and Reset** share the mode-heading row. **Dotted, Staccato, Tie / Untie,
Arpeggio and Tuplets** are grouped together beside the three accidental buttons. There is no
visible accidentals caption or staff-settings gear. **Add staff** is a compact rounded
button with a staff-and-plus icon centered below the last rendered staff, with extra
space above to suggest where the next staff will appear, without a
separate action strip. It opens the same visual clef chooser
as clicking a staff’s clef; that staff-specific dialog also offers **Remove staff**.
A single **+ Measure** button
sits in a reserved space to the right of the final system and appends one bar to every
staff. It stays vertically centred across all staffs in that system, on desktop and
mobile, independently of the active staff.

Click a key signature, tempo marking or time signature to edit it in an
**Apply / Cancel** dialog. These settings apply to the whole score; clefs are
staff-specific. Clef cards show Treble, Bass, Alto and Tenor on staff lines.
The key popup previews the draft accidentals in the launching staff’s clef, with
a text equivalent; the tempo popup uses symbol buttons for the beat unit and
previews its selected symbol, dot and BPM.
Previews change no music and make no sound before Apply. C major has a visible
key-label target, and native header controls
remain available if a marking cannot be measured. Tempo supports all five beat
units, including dotted units, at 20–400 BPM. The BPM refers to that chosen unit:
half note = 60 plays twice as fast as quarter note = 60. Meter supports numerators
1–32 and denominators 1, 2, 4, 8, 16 and 32. Changing meter preserves written
values and onsets where possible, moves conflicting tuplets intact to a fitting
bar, and rounds shared capacity up to complete bars. An oversized group or event
limit failure rejects the entire change. Dialog drafts do not enter history;
Apply is one Undo step. Code is available in the Melody code panel below the workspace.

Choose a value and fill a beat or subdivision. Notes and duration edits consume
available rests first, then carry conflicting later notes forward without
changing their pitches, duration, identity or order. Replacing a quarter rest
before a quarter note with a whole note moves that quarter note to beat one of
the next measure. A note can start inside the final measure and extend across
its barline; entering at the score endpoint also adds measures automatically.
The endpoint is reachable with score keyboard navigation.
**+ Measure** still adds empty space.

Only music in the edited staff is displaced. New measures pad every other staff
with rests while preserving its existing note timing. Notes crossing barlines
display tied segments but remain one event in code and playback. Tuplets move
as complete groups into a measure that fits. If any part would exceed 64 events,
the entire edit is rejected; one Undo restores an accepted insertion and all
of its carried notes and added measures.

Use up to four parts with independent Treble, Bass, Alto or Tenor clefs.
All parts share measure
capacity, meter, key signature and tempo (20–400 BPM in the selected beat unit). Changing key or clef preserves
existing pitches. Entry always uses the explicit selected accidental, even in a
sharp or flat key.
Reset score returns to one 4/4 treble measure in C major at quarter note = 120
with Natural note entry. One Undo restores a complete score change, including parts and settings.

Dotted entry and selected-event toggles multiply the written value by 1.5;
`.` toggles the applicable dot. Longer notes can use existing silence across
barlines, with display ties. Dot edits use the same carry behavior as duration
edits; new dotted entry extends measure capacity when needed.
In **Edit melody**, click a rest first, then open **Tuplets** beside Tie and Arpeggio,
and choose a notation symbol to apply it to the selected rest. The menu contains
**Duplet, Triplet, Quadruplet, Quintuplet, Sextuplet, Septuplet and Octuplet**
symbols: notes beneath a bracket with the group's number, with written values
chosen automatically from the selected rest. Names remain in accessible labels and hover/focus hints, without
numeric ratio labels. Clicking a rest only selects it; it never applies a tuplet.
The menu is disabled until a rest is selected and remains disabled for pitched
notes or unsupported operations. There is no armed score-click tool or extra
confirmation. Each click on a preset is one silent, undoable score edit.

There is no manual written-value selector. Each choice fills exactly the selected
rest's duration: a quarter rest becomes three eighth-note triplets, while a dotted
quarter rest becomes two eighth-note duplets. Unsupported exact fits stay disabled;
tuplets never consume neighboring rests to make room. Hover/focus hints give the
name, inferred note value and occupied time. Conflicts, occupied groups, bar crossings
and the event cap retain the previous score. Select another rest before applying
another group. **Remove tuplet** is available for an entirely empty selected
group; changing a completely empty group uses its full duration to infer the new
written value. Pitched members protect its rhythm. Write mode still fills existing
protected slots at their exact times, and Delete restores a slot's rest.

Tie to next (T) sustains matching written pitches in touching adjacent events of
one staff. Individual chord tones and selected adjacent pairs can be tied;
invalidated ties are removed with a status message after pitch/duration edits.
Arpeggio rolls a selected chord up or down without moving later events.
The Tie toolbar icon curves upward. Arpeggio uses a single vertical wavy line,
and the Tuplets trigger shows beamed notes with a question mark above them.
**Staccato** has a fixed quarter-note icon with a separate dot below the notehead.
In Write it sets the next notes' articulation; in Edit it
toggles the selected note or chord as one undoable change. Rests cannot be marked
staccato. The mark appears in notation and is saved as `staccato: true` in event
code. Playback shortens independent attacks to half their written duration without
moving later notes or the score endpoint; existing ties retain their full sustain.
Converting an event to a rest removes its staccato mark, and Undo restores it.

In Write mode, each newly placed note or chord tone stays selected, including the
last note of a measure. Clicking existing noteheads does nothing in Write, in both
Notes and Rests entry. Switch to Edit to select them. Clicking a different pitch in a column still adds a chord tone.
Up/Down adjusts the most recently placed tone. The note-value toolbar sets the
next entry. Escape or Left/Right clears the selection; entry stays in Write mode.
Edit uses the sheet selection, toolbar, piano and keyboard directly; selecting
a note does not open an additional panel.

**Reverb On/Off**, beside score zoom, adds an optional light room effect with a
short 0.38-second decay and a quiet wet signal. It applies to entry previews and
full playback, including sampled instruments and Synth, without changing score
timing, history or code. It starts off, stays local to the current editor session,
and uses no downloads. Stop, score edits and navigation clear the effect's tail.
Pointer entry covers F3–F6 in Treble, F1–F6 in Bass, G2–F6 in Alto and E2–F6 in
Tenor, with ledger lines. Code and
keyboard arrows can reach MIDI 0–127. In Edit, click one chord member; Shift-click
toggles more notes across chords, rows and parts. Only selected noteheads receive
a lavender tint. Up/Down moves the selected notes by a semitone, and Delete
restores silence without moving later notes. Group changes are atomic; collisions
or range/cap failures leave every part unchanged. In Edit, the top value buttons change
the selection instead of the next entry.

The aligned parts wrap into rows, including dense measures on mobile. Zoom −/+,
from 75–200%, changes display size without editing music or history; the percentage
button resets it to 100%. Larger or indivisible dense scores can scroll inside
the score area while the page retains normal vertical scrolling. Long notes
crossing a visual continuation are tied without changing musical time. Eighths/sixteenths beam by denominator beat, with three-eighth groups in
6/8, 9/8 and 12/8. Placing a note auditions it; adding a chord tone auditions the
resulting chord. Accepted pitch arrows also audition the destination at the global
tempo. Feedback is capped at one beat and half a second; full Play preserves each
part's timing and plays them together. Use N for Write and E for Edit
outside text fields.

Melody code starts collapsed in a secondary panel. Its heading opens it; closing
it retains the draft, caret and selected source line. Unapplied
code keeps a visible warning and Review code action above the score, and an Apply
error opens the panel. Selecting a note alone does not open it.
The code is editable, with numbered lines that highlight the primary
selected event's line. The data-only STAVES format includes globals, staff IDs,
the four supported clefs and written `duration`, `dotted`, `staccato`, `tuplet`, `tieToNext` and `arpeggio`
fields on event lines. `TIME_SIGNATURE` stores the meter, and `TEMPO_BEAT`
stores `{ duration: 'quarter', dotted: false }` by default; legacy code without
`TEMPO_BEAT` retains quarter-note tempo. Exact timing is derived; no rounded recurring beat values
are required. Legacy two-clef type declarations and STAVES/MELODY objects with numeric `beats`
still import; MELODY becomes one treble part. Staff IDs use
1–80 ASCII letters, digits, underscores, periods, colons or hyphens. Apply code
replaces the complete score as one undoable change; Reset code to score discards
the draft. Unapplied code blocks score changes and playback; a score-property dialog
also blocks code and score mutations until applied or canceled. Code accepts
literal MIDI/chord pitches and supported written rhythms in equal complete measures in `TIME_SIGNATURE`;
length and rhythm labels are derived. Limits are four parts, 64 events per part
including normalized rests, eight pitches per chord and 250,000 code characters.
Reload restores the latest browser/account draft; Undo history starts fresh.
It does not read or write Brodle drafts, progress, or cloud melodies.
Add future internal experiment routes beneath `TestingAccess` in `src/App.tsx`,
then add their labels, descriptions, and paths to the destination list in
`src/components/testing/Testing.tsx`. Direct visits to child routes use the same
access check; login returns to the hub.

GitHub Pages serves frontend assets publicly. The route guard restricts the
rendered UI; private experimental data and actions also need server-side
authorization. Keep secrets and private static content out of the published app.

## Configuration and deployment

- [Security review, publication checks, and hosting settings](SECURITY.md)
- [Shared accounts, Supabase redirects, email confirmation, and SMTP](docs/supabase-auth.md)
- [Melody Studio, review, scheduling, and past puzzles](docs/brodle-library.md)
- [Private Red Bull access, ratings, and images](docs/redbull-private.md)

`npm run deploy` builds and publishes to the existing GitHub Pages custom domain.
The build copies `public/CNAME` and `public/.well-known/` automatically and creates
the SPA fallback before publishing. Deployment is a separate step from checks.

All pages share the header and footer. Brodle's practice melody lives in
[`musicGame.ts`](src/components/brodle/lib/musicGame.ts); published daily puzzles
come from Supabase. The original spinning-face GIF is the favicon and footer
image; tab animation depends on browser support. `/CrazyWildlife/` redirects to
the React wrapper around the original Unity player.
