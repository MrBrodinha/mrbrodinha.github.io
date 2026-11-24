import assert from 'node:assert/strict';
import test from 'node:test';
import abcjs from 'abcjs';
import {
  model as m,
  scoreModel as s,
  notation,
  playback,
  parseSheetCode,
  codeUrl,
} from './sheetEditorModules.mjs';

const { scoreCodeSnapshot } = await import(codeUrl);
const makeScore = (steps) =>
  s.scoreReducer(s.emptyScore(), {
    type: 'apply',
    seed: 'tie-shapes',
    value: { bpm: 120, key: 'C', staffs: [{ id: 'staff-1', clef: 'treble', steps }] },
  }).score;
const event = (pitches, tieToNext) => ({
  midi: pitches[0],
  ...(pitches.length > 1 ? { pitches } : {}),
  duration: 'quarter',
  ...(tieToNext ? { tieToNext } : {}),
});
const rest = { midi: null, duration: 'half' };
function engravedNotes(score, cuts = []) {
  const built = notation.scoreNotation(score, cuts),
    tune = abcjs.parseOnly(built.abc)[0];
  // Exercise the same public parsing callback supplied to the real renderer.
  built.afterParsing?.(tune);
  return tune.lines
    .flatMap((line) => line.staff?.flatMap((staff) => staff.voices.flat()) ?? [])
    .filter((note) => note.pitches);
}

test('G5 ties from C5/E5/G5 into a single G5 with both rendered endpoints', () => {
  let state = s.scoreReducer(s.emptyScore(), {
    type: 'apply',
    seed: 'report',
    value: {
      bpm: 120,
      key: 'C',
      staffs: [{ id: 'staff-1', clef: 'treble', steps: [event([72, 76, 79]), event([79]), rest] }],
    },
  });
  state = s.scoreReducer(state, { type: 'mode', mode: 'edit' });
  const chord = state.score.staffs[0].events[0],
    g = m.eventTones(chord)[2];
  state = s.scoreReducer(state, {
    type: 'select',
    staffId: 'staff-1',
    eventId: chord.id,
    toneId: g.id,
  });
  const before = state.score;
  state = s.scoreReducer(state, { type: 'tie' });
  const notes = engravedNotes(state.score);
  assert.ok(notes[0].pitches[2].startTie);
  assert.equal(notes[1].pitches[0].endTie, true, 'the singleton G5 must close the chord G5 tie');
  assert.ok(notes[0].pitches.slice(0, 2).every((p) => !p.startTie && !p.endTie));
  const performance = playback.performanceTimeline(state.score).events.filter((e) => e.midi === 79);
  assert.equal(performance.length, 1);
  assert.equal(performance[0].duration, 1);
  assert.equal(s.scoreReducer(state, { type: 'undo' }).score, before);
});

test('ties follow pitch when chord members change index and do not leak into later notes', () => {
  const score = makeScore([
    event([72, 76, 79], [76, 79]),
    event([76, 79, 83]),
    event([72, 76, 79]),
    event([72, 76, 79]),
  ]);
  const notes = engravedNotes(score);
  assert.deepEqual(
    notes[0].pitches.map((p) => Boolean(p.startTie)),
    [false, true, true],
  );
  assert.deepEqual(
    notes[1].pitches.map((p) => Boolean(p.endTie)),
    [true, true, false],
  );
  assert.ok(
    notes.slice(2).every((n) => n.pitches.every((p) => !p.startTie && !p.endTie)),
    'parser chord-index state must not attach a phantom later tie',
  );
});

test('a singleton ties only the matching member in a following chord', () => {
  const notes = engravedNotes(makeScore([event([79], [79]), event([72, 76, 79]), rest]));
  assert.deepEqual(
    notes[1].pitches.map((p) => Boolean(p.endTie)),
    [false, false, true],
  );
});

test('changing chord shapes retain tie chains across bar/system cuts and canonical code', () => {
  const score = makeScore([
    { midi: null, duration: 'half', dotted: true },
    event([72, 76, 79], [79]),
    event([79], [79]),
    event([76, 79, 83]),
    rest,
  ]);
  const parsed = parseSheetCode(scoreCodeSnapshot(score).code),
    restored = s.importScore(s.initialScore(), parsed, 'roundtrip');
  for (const candidate of [score, restored]) {
    const notes = engravedNotes(candidate, [4 * m.TICKS_PER_BEAT, 5 * m.TICKS_PER_BEAT]);
    assert.ok(notes[0].pitches[2].startTie);
    assert.equal(notes[1].pitches[0].endTie, true);
    assert.ok(notes[1].pitches[0].startTie);
    assert.deepEqual(
      notes[2].pitches.map((p) => Boolean(p.endTie)),
      [false, true, false],
    );
    const g = playback.performanceTimeline(candidate).events.filter((e) => e.midi === 79);
    assert.equal(g.length, 1);
    assert.equal(g[0].duration, 1.5);
  }
});

test('display continuation ties retain all chord members while authored ties retain only G5', () => {
  const score = makeScore([
    { ...event([72, 76, 79], [79]), dotted: true }, event([79]),
    { midi: null, duration: 'quarter', dotted: true },
  ]);
  const notes = engravedNotes(score, [m.TICKS_PER_BEAT]);
  assert.deepEqual(notes[0].pitches.map(p => Boolean(p.startTie)), [true, true, true]);
  assert.deepEqual(notes[1].pitches.map(p => Boolean(p.endTie)), [true, true, true]);
  assert.deepEqual(notes[1].pitches.map(p => Boolean(p.startTie)), [false, false, true]);
  assert.equal(notes[2].pitches[0].endTie, true);
});

test('ties remain local to their part when shared systems wrap', () => {
  const score = s.scoreReducer(s.emptyScore(), { type: 'apply', seed: 'parts', value: {
    bpm: 120, key: 'C', staffs: [
      { id: 'upper', clef: 'treble', steps: [event([72, 76, 79], [79]), event([79]), rest] },
      { id: 'lower', clef: 'bass', steps: [event([72, 76, 79]), event([79]), rest] },
    ],
  } }).score;
  const notes = engravedNotes(score, [m.TICKS_PER_BEAT]);
  assert.ok(notes[0].pitches[2].startTie); assert.equal(notes[2].pitches[0].endTie, true);
  assert.ok([notes[1], notes[3]].every(note => note.pitches.every(p => !p.startTie && !p.endTie)));
});
