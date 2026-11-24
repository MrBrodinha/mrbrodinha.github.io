import assert from 'node:assert/strict';
import test from 'node:test';
import abcjs from 'abcjs';
import { model as m, scoreModel as s, rhythm as r, notation as n, playback as p, parseSheetCode, codeUrl, parserUrl } from './sheetEditorModules.mjs';
const { scoreCodeSnapshot } = await import(codeUrl);
const { linkedScoreRange } = await import(parserUrl);
const B = m.TICKS_PER_BEAT;
const reduce = (state, action) => s.scoreReducer(state, action);
const events = state => state.score.staffs[0].events;
const fill = (state, tick, pitch, id) => reduce(state, { type: 'part', action: { type: 'fill', tick, pitch, id } });
const select = (state, id) => reduce(state, { type: 'select', staffId: state.active, eventId: id });
const apply = (steps, extra = {}, other = []) => reduce(s.emptyScore(), { type: 'apply', seed: 'properties', value: { bpm: 60, key: 'C', staffs: [{ id: 'staff-1', clef: 'treble', steps }, ...other], ...extra } });
const parsedNotes = score => abcjs.parseOnly(n.scoreNotation(score).abc)[0].lines.flatMap(line => line.staff?.[0].voices.flat() ?? []).filter(event => event.el_type === 'note' && !['spacer', 'invisible'].includes(event.rest?.type));

test('rest entry carries music from silence or an occupied onset, extends all staffs, and Undo restores identities', () => {
 for (const tick of [0, B]) {
  let state = reduce(s.emptyScore(), { type: 'add-staff', id: 'bass', clef: 'bass' });
  state = reduce(state, { type: 'activate', staffId: 'staff-1' });
  state = fill(state, B, 60, 'later');
  const before = state.score;
  state = reduce(state, { type: 'entry-kind', value: 'rest' });
  state = reduce(state, { type: 'tool', duration: 'whole' });
  state = fill(state, tick, 64, 'silence');
  const timeline = m.timedEvents(events(state));
  assert.equal(timeline.find(span => span.event.id === 'silence').start, tick);
  assert.equal(events(state).find(event => event.id === 'silence').authored, true);
  assert.equal(timeline.find(span => span.event.id === 'later').start, tick + 4 * B);
  assert.ok(state.score.staffs.every(staff => m.totalTicks(staff.events) === 8 * B));
  assert.equal(p.performanceTimeline(state.score).events[0].time, (tick + 4 * B) / B / 2);
  assert.equal(reduce(state, { type: 'undo' }).score, before);
  assert.match(scoreCodeSnapshot(state.score).code, /"midi":null,"duration":"whole"/);
 }
});

test('Edit type conversion keeps onset and dotted value, removes chord expressions, and Undo restores all tones', () => {
 let state = apply([{ midi: 60, pitches: [60, 64, 67], duration: 'half', dotted: true, arpeggio: 'down' }, { midi: null, duration: 'quarter' }]);
 state = reduce(state, { type: 'mode', mode: 'edit' });
 const event = events(state)[0], original = state.score;
 state = select(state, event.id);
 state = reduce(state, { type: 'entry-kind', value: 'rest' });
 assert.equal(events(state)[0].id, event.id);
 assert.equal(events(state)[0].duration, 'half');
 assert.equal(events(state)[0].dotted, true);
 assert.equal(events(state)[0].midi, null);
 assert.equal(events(state)[0].arpeggio, undefined);
 const rest = state.score;
 state = reduce(state, { type: 'entry-kind', value: 'note' });
 assert.deepEqual(m.eventTones(events(state)[0]).map(t => m.pitchMidi(t.spelling)), [64]);
 assert.equal(events(state)[0].dotted, true);
 assert.equal(reduce(state, { type: 'apply', value: parseSheetCode(scoreCodeSnapshot(state.score).code), seed: 'converted-noop' }), state);
 state = reduce(state, { type: 'undo' }); assert.equal(state.score, rest);
 state = reduce(state, { type: 'undo' }); assert.equal(state.score, original);
});

test('all supported tempo units, dots and BPM bounds agree in playback, ABC and code', () => {
 for (const duration of m.NOTE_VALUES) for (const dotted of [false, true]) for (const bpm of [20, 60, 400]) {
  const tempoBeat = { duration, dotted };
  const state = apply([{ midi: 60, duration: 'quarter' }, { midi: null, duration: 'half', dotted: true }], { bpm, tempoBeat });
  const expected = B / r.tempoBeatTicks(tempoBeat) * 60 / bpm;
  const timeline = p.performanceTimeline(state.score);
  assert.equal(timeline.events[0].duration, expected);
  assert.equal(timeline.totalDuration, expected * 4);
  assert.equal(p.auditionTimeline([60], bpm, .125, undefined, tempoBeat).totalDuration, Math.min(.5, expected * .125));
  const abc = abcjs.parseOnly(n.scoreNotation(state.score).abc)[0];
  assert.equal(abc.metaText.tempo.bpm, bpm);
  assert.equal(abc.metaText.tempo.duration[0], r.tempoBeatTicks(tempoBeat) / (4 * B));
  const parsed = parseSheetCode(scoreCodeSnapshot(state.score).code);
  assert.deepEqual({ ...parsed.tempoBeat }, tempoBeat);
  assert.equal(reduce(state, { type: 'apply', seed: 'noop', value: parsed }), state);
 }
 for (const [duration, dotted, expected] of [['quarter', false, 1], ['half', false, .5], ['quarter', true, 2 / 3], ['sixteenth', false, 4]]) {
  assert.equal(p.performanceTimeline(apply([{ midi: 60, duration: 'quarter' }, { midi: null, duration: 'half', dotted: true }], { tempoBeat: { duration, dotted } }).score).events[0].duration, expected);
 }
 const compound = apply([{ midi: 60, duration: 'half', dotted: true }], { meter: { numerator: 6, denominator: 8 }, tempoBeat: { duration: 'quarter', dotted: true } });
 assert.equal(p.performanceTimeline(compound.score).totalDuration, 2);
});

test('tempo units preserve tie sustain and arpeggio timing without quarter-equivalent clamps', () => {
 const state = apply([{ midi: 60, pitches: [60, 64], duration: 'quarter', tieToNext: [60], arpeggio: 'up' }, { midi: 60, duration: 'quarter' }, { midi: null, duration: 'half' }], { bpm: 400, tempoBeat: { duration: 'whole', dotted: true } });
 const timeline = p.performanceTimeline(state.score), quarter = r.secondsForTicks(B, 400, state.score.tempoBeat);
 assert.equal(timeline.events.length, 2); assert.equal(timeline.events[0].duration, quarter * 2);
 assert.equal(timeline.events[1].time, quarter / 3); assert.equal(timeline.events[0].sustain, true);
});

test('meter changes preserve IDs, values and timing while rounding shared capacity up to whole bars', () => {
 let original = apply(Array.from({ length: 8 }, (_, i) => ({ midi: 60 + i, duration: 'quarter' })), {}, [{ id: 'bass', clef: 'bass', steps: [{ midi: 36, duration: 'whole' }, { midi: 38, duration: 'whole' }] }]);
 for (const meter of [{ numerator: 3, denominator: 4 }, { numerator: 6, denominator: 8 }, { numerator: 7, denominator: 8 }, { numerator: 5, denominator: 16 }]) {
  const state = reduce(original, { type: 'meter', value: meter });
  assert.deepEqual(state.score.meter, meter);
  const capacity = Math.ceil(8 * B / r.measureTicks(meter)) * r.measureTicks(meter);
  assert.ok(state.score.staffs.every(staff => m.totalTicks(staff.events) === capacity));
  for (let part = 0; part < 2; part++) {
   const old = m.timedEvents(original.score.staffs[part].events).filter(span => span.event.midi !== null);
   const current = m.timedEvents(state.score.staffs[part].events);
   for (const span of old) { const actual = current.find(item => item.event.id === span.event.id); assert.equal(actual.start, span.start); assert.deepEqual(actual.event, span.event); }
  }
  assert.equal(p.performanceTimeline(state.score).events[0].duration, 1);
  const parsed = parseSheetCode(scoreCodeSnapshot(state.score).code); assert.deepEqual(parsed.meter, meter);
  assert.equal(reduce(state, { type: 'apply', value: parsed, seed: 'same' }), state);
  assert.ok(n.scoreNotation(state.score).abc.includes(`M:${r.meterName(meter)}`));
  assert.equal(reduce(state, { type: 'undo' }).score, original.score);
 }
 assert.equal(m.totalTicks(events(reduce(original, { type: 'meter', value: { numerator: 3, denominator: 4 } }))), 9 * B);
 assert.equal(m.positionLabel(B * 1.75, { numerator: 7, denominator: 8 }), 'Measure 1, beat 4 + 0.5');
 const whole = reduce(apply([{ midi: 60, duration: 'whole' }]), { type: 'meter', value: { numerator: 3, denominator: 4 } });
 const fragments = parsedNotes(whole.score).filter(note => note.pitches);
 assert.deepEqual(fragments.map(note => note.duration), [.75, .25]);
 assert.ok(fragments[0].pitches[0].startTie); assert.ok(fragments[1].pitches[0].endTie);
});

test('rebar moves protected tuplets intact, carries following notes, rejects too-short bars and restores exact Undo', () => {
 const group = Array.from({ length: 3 }, (_, i) => ({ midi: 60 + i, duration: 'quarter', tuplet: { id: 'g', count: 3, inTimeOf: 2, index: i + 1 } }));
 const original = apply([{ midi: null, duration: 'half' }, ...group, { midi: 72, duration: 'quarter' }, { midi: null, duration: 'half', dotted: true }]);
 const state = reduce(original, { type: 'meter', value: { numerator: 3, denominator: 4 } });
 const spans = m.timedEvents(events(state)), members = spans.filter(span => span.event.tuplet);
 assert.equal(members[0].start, 3 * B); assert.equal(members.at(-1).end, 5 * B);
 assert.deepEqual(members.map(span => span.event), events(original).filter(event => event.tuplet));
 assert.equal(spans.find(span => span.event.midi === 72).start, 5 * B);
 assert.equal(reduce(state, { type: 'undo' }).score, original.score);
 const rejected = reduce(original, { type: 'meter', value: { numerator: 1, denominator: 4 } });
 assert.equal(rejected.score, original.score); assert.equal(rejected.past, original.past); assert.match(rejected.message, /Nothing changed/);
 const stale = reduce(state, { type: 'meter', value: { numerator: 7, denominator: 8 }, revision: original.revision }); assert.equal(stale, state);
});

test('meter capacity failure in a secondary staff is atomic', () => {
 const original = apply(Array.from({ length: 32 }, () => ({ midi: 60, duration: 'whole' })), {}, [{ id: 'bass', clef: 'bass', steps: Array.from({ length: 64 }, () => ({ midi: 36, duration: 'half' })) }]);
 assert.equal(original.score.staffs.length, 2);
 const rejected = reduce(original, { type: 'meter', value: { numerator: 3, denominator: 4 } });
 assert.equal(rejected.score, original.score); assert.equal(rejected.past, original.past); assert.match(rejected.message, /64/);
});

test('new metadata has source linkage and legacy defaults; malformed or executable metadata is rejected', () => {
 const legacy = "const BPM=60;const KEY='C';const TIME_SIGNATURE='4/4';const MELODY=[{midi:60,beats:4}];";
 const parsed = parseSheetCode(legacy); assert.deepEqual(parsed.meter, r.DEFAULT_METER); assert.deepEqual(parsed.tempoBeat, r.DEFAULT_TEMPO_BEAT);
 const state = reduce(s.emptyScore(), { type: 'apply', value: parsed, seed: 'legacy' });
 assert.equal(p.performanceTimeline(state.score).totalDuration, 4);
 const fresh = apply([{ midi: 60, duration: 'half', dotted: true }, { midi: null, duration: 'quarter' }]);
 const imported = reduce(s.emptyScore(), { type: 'apply', value: parseSheetCode(scoreCodeSnapshot(fresh.score).code), seed: 'fresh-rest' });
 assert.equal(events(imported).at(-1).authored, true);
 const rebared = reduce(imported, { type: 'meter', value: { numerator: 7, denominator: 8 } });
 const writtenRest = events(rebared).find(event => event.id === events(imported).at(-1).id);
 assert.equal(writtenRest.duration, 'quarter');
 assert.equal(reduce(imported, { type: 'apply', value: parseSheetCode(scoreCodeSnapshot(imported.score).code), seed: 'fresh-noop' }), imported);
 const snapshot = scoreCodeSnapshot(state.score), scoreParsed = parseSheetCode(snapshot.code), staff = state.score.staffs[0];
 assert.ok(linkedScoreRange(scoreParsed, state.score, staff.id, staff.events[0].id));
 for (const invalid of ["null", "{duration:'quarter'}", "{duration:'thirty-second',dotted:false}", "{duration:'half',dotted:1}", "{duration:'half',dotted:false,extra:true}", "(()=>({duration:'half',dotted:false}))()"]) assert.throws(() => parseSheetCode(legacy + `const TEMPO_BEAT=${invalid};`));
 for (const meter of ['0/4', '33/4', '4/3', 'NaN/4', '4.5/4']) assert.throws(() => parseSheetCode(legacy.replace('4/4', meter)));
 let changed = reduce(state, { type: 'tempo', bpm: 60, beat: { duration: 'half', dotted: true } });
 changed = reduce(changed, { type: 'meter', value: { numerator: 3, denominator: 4 } });
 changed = reduce(changed, { type: 'entry-kind', value: 'rest' });
 const reset = reduce(changed, { type: 'reset' }); assert.deepEqual(reset.score.meter, r.DEFAULT_METER); assert.deepEqual(reset.score.tempoBeat, r.DEFAULT_TEMPO_BEAT); assert.equal(reset.entryKind, 'note'); assert.equal(s.isDefaultScore(reset.score), true);
});

test('compound and denominator-beat beams follow the meter', () => {
 for (const [meter, count, perGroup] of [[{ numerator: 6, denominator: 8 }, 6, 3], [{ numerator: 9, denominator: 8 }, 9, 3], [{ numerator: 7, denominator: 8 }, 14, 2]]) {
  const duration = count === 14 ? 'sixteenth' : 'eighth';
  const notes = parsedNotes(apply(Array.from({ length: count }, () => ({ midi: 60, duration })), { meter }).score);
  notes.forEach((note, index) => { assert.equal(Boolean(note.startBeam), index % perGroup === 0); assert.equal(Boolean(note.endBeam), index % perGroup === perGroup - 1); });
 }
});
