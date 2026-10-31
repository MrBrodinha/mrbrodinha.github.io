import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import abcjs from 'abcjs';

// Use the project's compiler so the tests also run on Node without TS support.
const source = await readFile(new URL('../src/components/musicGame.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { toAbc, noteName, notationKey, getWinKind, scoreGuess, buildShareText } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const pattern = (notes) => notes.map((midi) => ({ midi, length: '1', beats: 1, rhythm: 'Quarter note' }));
const parse = (notes, key) => abcjs.parseOnly(toAbc(notes, 'letters', pattern(notes), key))[0];
const soundingPitches = (tune) => tune.setUpAudio({}).tracks.flat()
  .filter((event) => event.cmd === 'note').map((event) => event.pitch);

test('F major implies B-flat, cancels it for B natural, and restores the flat when needed', () => {
  const notes = [70, 71, 70, 70];
  const abc = toAbc(notes, 'letters', pattern(notes), 'F');
  assert.match(abc, /K:F clef=treble/);
  assert.match(abc, /"_Bb4"B1 "_B4"=B1 "_Bb4"_B1 "_Bb4"B1/);
  assert.equal(noteName(70, 'letters', 'F'), 'Bb4');
  assert.equal(noteName(71, 'letters', 'F'), 'B4');
  const tune = abcjs.parseOnly(abc)[0];
  assert.deepEqual(tune.getKeySignature().accidentals.map(({ acc, note }) => ({ acc, note: note.toUpperCase() })), [{ acc: 'flat', note: 'B' }]);
  assert.deepEqual(soundingPitches(tune), notes);
});

test('accidentals apply within their octave and reset to the key signature at a bar line', () => {
  const notes = [71, 71, 82, 83, 70, 71, 70, 70];
  const abc = toAbc(notes, 'letters', pattern(notes), 'F');
  assert.match(abc, /"_B4"=B1 "_B4"B1 "_Bb5"b1 "_B5"=b1 \| "_Bb4"B1/);
  assert.deepEqual(soundingPitches(abcjs.parseOnly(abc)[0]), notes);
});

test('G major implies F-sharp and writes F natural with a natural sign', () => {
  const notes = [66, 65, 66];
  const abc = toAbc(notes, 'letters', pattern(notes), 'G');
  assert.match(abc, /"_F#4"F1 "_F4"=F1 "_F#4"\^F1/);
  assert.deepEqual(soundingPitches(abcjs.parseOnly(abc)[0]), notes);
});

test('every piano pitch survives notation in each supported major and minor key', () => {
  const keys = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#',
    'Abm', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m'];
  const notes = Array.from({ length: 37 }, (_, index) => index + 48);
  for (const key of keys) assert.deepEqual(soundingPitches(parse(notes, key)), notes, key);
});

test('a submitted shifted melody can be written in its transposed key', () => {
  const melody = pattern([65, 69, 70]);
  assert.equal(notationKey([67, 71, 72], melody, 'F'), 'G');
  assert.equal(notationKey([65, 69, 70], melody, 'F'), 'F');
  assert.equal(notationKey([65, 69, 71], melody, 'F'), 'F');
});

test('consistent octave offsets are a distinct win, while exact and other shifts stay separate', () => {
  const target = [60, 64, 67];
  for (const offset of [-24, -12, 12, 24]) {
    const notes = target.map((note) => note + offset);
    assert.equal(getWinKind(notes, target), 'octave');
    assert.deepEqual(scoreGuess(notes, target), ['octave', 'octave', 'octave']);
    assert.equal(notationKey(notes, pattern(target), 'F'), 'F');
  }
  assert.equal(getWinKind(target, target), 'exact');
  assert.deepEqual(scoreGuess(target, target), ['correct', 'correct', 'correct']);
  assert.equal(getWinKind([61, 65, 68], target), 'shifted');
  assert.deepEqual(scoreGuess([61, 65, 68], target), ['shifted', 'shifted', 'shifted']);
});

test('mixed octave offsets, wrong intervals, and incomplete guesses do not win', () => {
  const target = [60, 64, 67];
  for (const notes of [[48, 64, 79], [48, 52, 56], [48, 52], []]) {
    assert.equal(getWinKind(notes, target), null);
  }
});

test('octave results have their own share, and exact wins upgrade them', () => {
  const target = [60, 64, 67];
  const attempt = (notes) => ({ notes, feedback: scoreGuess(notes, target) });
  const shifted = attempt([61, 65, 68]);
  const octave = attempt([48, 52, 55]);
  const url = 'https://example.com/brodle';
  const share = buildShareText([shifted, octave], target, url);
  assert.match(share, /^Brodle ↕\nMelody found in 2 attempts — different octave!/);
  assert.match(share, /1\. ♪♪♪\n2\. ↕↕↕/);
  assert.match(share, /↕ correct melody, different octave/);
  const exact = buildShareText([shifted, octave, attempt(target)], target, url);
  assert.match(exact, /^Brodle 🎉\nExact pitch found in 3 attempts!/);
  assert.match(exact, /3\. ✓✓✓/);
});
