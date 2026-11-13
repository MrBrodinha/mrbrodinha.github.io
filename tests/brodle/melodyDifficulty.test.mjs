import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function moduleUrl(source, imports = {}) {
  let js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  for (const [name, url] of Object.entries(imports)) js = js.replaceAll(`from "${name}"`, `from '${url}'`).replaceAll(`from '${name}'`, `from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
const source = path => readFile(new URL('../../src/components/brodle/' + path, import.meta.url), 'utf8');
const ratingUrl = moduleUrl(await source('lib/melodyDifficulty.ts'));
const { rateMelody } = await import(ratingUrl);
const { default: MelodyDifficulty } = await import(moduleUrl(await source('components/MelodyDifficulty.tsx'), {
  '../lib/melodyDifficulty': ratingUrl, 'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
}));
const melody = pitches => pitches.map(midi => ({ midi }));

test('rates simple, moderate, and complex melodies across all four features', () => {
  const easy = rateMelody(melody([60, 60, 67, 67, 69, 69, 67]));
  assert.equal(easy.level, 'Easy');
  assert.equal(easy.noteCount, 7);
  assert.equal(easy.uniquePitches, 3);
  assert.equal(easy.rangeSemitones, 9);
  assert.equal(easy.largestJump, 7);

  const medium = rateMelody(melody([60, 64, 67, 72, 67, 64, 60, 64, 67, 72]));
  assert.equal(medium.level, 'Medium');
  assert.equal(medium.score, 3, 'ten notes, four pitches, an octave, moderate jumps');

  const chromatic = rateMelody(melody(Array.from({ length: 17 }, (_, index) => 60 + index)));
  assert.equal(chromatic.level, 'Hard', 'length, pitch variety, and range can make small steps difficult');
  assert.equal(chromatic.score, 6);
  assert.equal(chromatic.averageJump, 1);

  const leaping = rateMelody(melody(Array.from({ length: 18 }, (_, index) => index % 2 ? 72 : 48)));
  assert.equal(leaping.level, 'Hard', 'large repeated leaps matter even with only two unique pitches');
  assert.equal(leaping.uniquePitches, 2);
  assert.equal(leaping.rangeSemitones, 24);
});

test('uses stable tier boundaries for the initial rating', () => {
  const cases = [
    [[60, 60, 67, 67, 69, 69, 67], 2, 'Easy'],
    [[60, 64, 67, 72, 67, 64, 60, 64, 67, 72], 3, 'Medium'],
    [[60, 62, 64, 65, 67, 69, 71, 72, 60, 62, 64, 65, 67, 69, 71, 72], 5, 'Medium'],
    [Array.from({ length: 17 }, (_, index) => 60 + index), 6, 'Hard'],
  ];
  for (const [pitches, score, level] of cases) {
    const rating = rateMelody(melody(pitches));
    assert.equal(rating.score, score);
    assert.equal(rating.level, level);
  }
});

test('pitch span and rating are invariant under transposition, including across octave boundaries', () => {
  const pitches = [59, 62, 66, 71, 66, 62, 59, 62, 66, 71];
  const original = rateMelody(melody(pitches));
  for (const offset of [-24, -1, 1, 5, 12, 24]) {
    assert.deepEqual(rateMelody(melody(pitches.map(pitch => pitch + offset))), original);
  }
});

test('ignores rests and rhythmic durations while preserving jumps across rests', () => {
  const pitches = [60, 65, 60, 72, 67, 60, 65, 60, 72];
  const withRests = pitches.flatMap((midi, index) => [
    { midi: null, beats: 4 }, { midi, beats: index % 2 ? .25 : 2, triplet: 1 },
  ]);
  assert.deepEqual(rateMelody(withRests), rateMelody(melody(pitches)));
});

test('handles empty drafts, rest-only melodies, and a single note without inventing intervals', () => {
  assert.equal(rateMelody([]), null);
  assert.equal(rateMelody(melody([null, null])), null);
  assert.deepEqual(rateMelody(melody([60])), {
    level: 'Easy', score: 0, noteCount: 1, uniquePitches: 1,
    rangeSemitones: 0, averageJump: 0, largestJump: 0,
  });
  assert.equal(rateMelody(melody(Array(32).fill(60))).level, 'Easy', 'repetition alone should not make a melody Hard');
});

test('accounts for frequent moderate jumps and occasional large leaps', () => {
  assert.equal(rateMelody(melody([60, 62, 60, 62])).score, 0);
  assert.equal(rateMelody(melody([60, 64, 60, 64])).score, 1);
  assert.equal(rateMelody(melody([60, 65, 60, 65])).score, 2);
  const isolated = rateMelody(melody([60, 60, 60, 68, 68, 68]));
  assert.ok(isolated.averageJump < 2);
  assert.equal(isolated.score, 3, 'an isolated large leap still raises the interval score');
});

test('shows a readable rating for existing stored notes and updates when melody props change', () => {
  const render = pitches => renderToStaticMarkup(createElement(MelodyDifficulty, {
    melody: melody(pitches).map(note => ({ ...note, beats: 1 })),
  }));
  assert.equal(render([]), '');
  assert.equal(render([null]), '');
  const easy = render([60, 62, 64]);
  assert.match(easy, /difficulty-easy/);
  assert.match(easy, /Difficulty: <strong>Easy<\/strong>/);
  const hard = render(Array.from({ length: 17 }, (_, index) => 60 + index));
  assert.match(hard, /difficulty-hard/);
  assert.match(hard, /Difficulty: <strong>Hard<\/strong>/);
});
