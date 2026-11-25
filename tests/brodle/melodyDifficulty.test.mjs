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
const { rateMelody, difficultyForScore, MELODY_DIFFICULTY_LEVELS } = await import(ratingUrl);
const { default: MelodyDifficulty } = await import(moduleUrl(await source('components/MelodyDifficulty.tsx'), {
  '../lib/melodyDifficulty': ratingUrl, 'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
}));
const musicUrl = moduleUrl(await source('lib/musicGame.ts'));
const victoryUrl = moduleUrl(await source('lib/victoryMusic.ts'), { './musicGame': musicUrl });
const composerUrl = moduleUrl(await source('creator/melodyComposer.ts'), { '../lib/musicGame': musicUrl, '../lib/victoryMusic': victoryUrl });
const libraryUrl = moduleUrl(await source('lib/melodyLibrary.ts'), { './musicGame': musicUrl, './victoryMusic': victoryUrl, '../creator/melodyComposer': composerUrl });
const childUrl = `data:text/javascript,export default function Child() { return null; }`;
const difficultyUrl = moduleUrl(await source('components/MelodyDifficulty.tsx'), {
  '../lib/melodyDifficulty': ratingUrl, 'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
});
const { default: MelodyCard } = await import(moduleUrl(await source('library/MelodyCard.tsx'), {
  react: import.meta.resolve('react'), 'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
  '../lib/musicGame': musicUrl, '../lib/melodyLibrary': libraryUrl, '../lib/victoryMusic': victoryUrl,
  '../creator/melodyComposer': composerUrl, '../components/MelodyDifficulty': difficultyUrl,
  '../components/SheetMusic': childUrl, '../components/BrodleIcon': childUrl, './MelodyCodePreview': childUrl,
}));
const melody = pitches => pitches.map(midi => ({ midi }));

// Transcribed from the user's screenshot labels, rather than fetched song data.
const chopin = [64, 69, 71, 72, 72, 74, 76, 77];
const corea = [74, 78, 74, 76, 74, 71, 74, 73, 69, 73, 71, 67, 69, 69, 69, 66, 66, 66];
const anchors = [
  { pitches: [60], score: 0, level: 'Very Easy', slug: 'very-easy' },
  { pitches: chopin, score: 37.829787340156, level: 'Easy', slug: 'easy' },
  { pitches: corea, score: 51.40770677772575, level: 'Medium', slug: 'medium' },
  { pitches: Array.from({ length: 24 }, (_, index) => 60 + index), score: 68.52726574500768, level: 'Hard', slug: 'hard' },
  { pitches: Array.from({ length: 32 }, (_, index) => (index % 2 ? 80 : 40) + Math.floor(index / 2)), score: 100, level: 'Very Hard', slug: 'very-hard' },
];

test('calibrates all five levels and separates the two screenshot excerpts', () => {
  for (const { pitches, score, level, slug } of anchors) {
    const rating = rateMelody(melody(pitches));
    assert.ok(Math.abs(rating.score - score) < 1e-9, `${level}: ${rating.score}`);
    assert.equal(rating.level, level);
    assert.equal(rating.slug, slug);
  }
  const short = rateMelody(melody(chopin));
  const long = rateMelody(melody(corea));
  assert.deepEqual([short.noteCount, short.uniquePitches, short.rangeSemitones], [8, 7, 13]);
  assert.deepEqual([long.noteCount, long.uniquePitches, long.rangeSemitones], [18, 8, 12]);
  assert.ok(long.score > short.score, 'a slightly wider span cannot dominate the short excerpt');
});

test('classifies unrounded scores at every boundary with five stable labels and slugs', () => {
  assert.deepEqual(MELODY_DIFFICULTY_LEVELS.map(({ level, slug }) => [level, slug]), anchors.map(({ level, slug }) => [level, slug]));
  assert.equal(difficultyForScore(0).level, 'Very Easy');
  assert.equal(difficultyForScore(100).level, 'Very Hard');
  for (const [index, boundary] of [20, 40, 60, 80].entries()) {
    assert.equal(difficultyForScore(boundary - .0001).level, anchors[index].level);
    assert.equal(difficultyForScore(boundary).level, anchors[index + 1].level);
    assert.equal(difficultyForScore(boundary + .0001).level, anchors[index + 1].level);
  }
});

test('repetition alone stays Easy, while pitch variety and large jumps raise difficulty', () => {
  for (const count of [32, 64, 256]) {
    const repeated = rateMelody(melody(Array(count).fill(60)));
    assert.equal(repeated.level, 'Easy');
    assert.equal(repeated.score, 35);
  }
  const varied = rateMelody(melody(anchors.at(-1).pitches));
  assert.ok(varied.score > rateMelody(melody(Array(32).fill(60))).score);
  const isolated = rateMelody(melody([60, 60, 60, 68, 68, 68]));
  const small = rateMelody(melody([60, 60, 60, 62, 62, 62]));
  assert.ok(isolated.averageJump < 2);
  assert.ok(isolated.contributions.intervals > small.contributions.intervals, 'a rare leap still contributes');
});

test('controlled increases in length, variety, span and jumps never lower the score', () => {
  const pairs = [
    [[60, 64, 60, 64], [60, 64, 60, 64, 60, 64]],
    [[60, 62, 60, 62], [60, 62, 64, 66]],
    [[60, 61, 60, 61], [60, 72, 60, 72]],
  ];
  for (const [before, after] of pairs) {
    const low = rateMelody(melody(before)), high = rateMelody(melody(after));
    for (const metric of ['noteCount', 'uniquePitches', 'rangeSemitones', 'averageJump', 'largestJump']) {
      assert.ok(high[metric] >= low[metric], `${metric} must not decrease in this controlled pair`);
    }
    assert.ok(high.score > low.score);
  }
});

test('pitch span and rating are invariant under transposition, including across octave boundaries', () => {
  for (const { pitches } of anchors) {
    const original = rateMelody(melody(pitches));
    for (const offset of [-24, -1, 1, 5, 12, 24]) {
      assert.deepEqual(rateMelody(melody(pitches.map(pitch => pitch + offset))), original);
    }
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
    level: 'Very Easy', slug: 'very-easy', score: 0,
    contributions: { length: 0, variety: 0, span: 0, intervals: 0 }, noteCount: 1, uniquePitches: 1,
    rangeSemitones: 0, averageJump: 0, largestJump: 0,
  });
});

test('scores stay bounded over legal extremes and long stored melodies', () => {
  for (const pitches of [Array(256).fill(0), Array.from({ length: 256 }, (_, i) => i % 128), Array.from({ length: 256 }, (_, i) => i % 2 ? 127 : 0)]) {
    const { score, contributions } = rateMelody(melody(pitches));
    assert.ok(Number.isFinite(score) && score >= 0 && score <= 100);
    assert.ok(Object.values(contributions).every(value => value >= 0));
  }
});

test('shows a readable rating for existing stored notes and updates when melody props change', () => {
  const render = pitches => renderToStaticMarkup(createElement(MelodyDifficulty, {
    melody: melody(pitches).map(note => ({ ...note, beats: 1 })),
  }));
  assert.equal(render([]), '');
  assert.equal(render([null]), '');
  for (const { pitches, level, slug } of anchors) {
    const markup = render(pitches);
    assert.ok(markup.includes(`Difficulty: <strong>${level}</strong>`));
    assert.ok(markup.includes(`class="melody-difficulty difficulty-${slug}"`));
    assert.match(markup, /data-tour="difficulty"/);
    assert.doesNotMatch(markup, /<details|<summary|sounding notes|distinct pitches|semitones of span/);
  }
});

test('creator/library opt-in shows note metrics in a native disclosure, with singular labels', () => {
  const render = pitches => renderToStaticMarkup(createElement(MelodyDifficulty, { melody: melody(pitches), showDetails: true }));
  assert.match(render(chopin), /<details class="melody-difficulty-details"><summary>About this rating<\/summary>/);
  assert.match(render(chopin), /8 sounding notes · 7 distinct pitches · 13 semitones of span/);
  assert.match(render(corea), /18 sounding notes · 8 distinct pitches · 12 semitones of span/);
  assert.match(render([60]), /1 sounding note · 1 distinct pitch · 0 semitones of span/);
  assert.match(render([60, 61]), /1 semitone of span/);
  assert.match(render(chopin), /same rules and optional hints for everyone/);
  assert.equal(render([null]), '');
});

test('library/review cards derive the shared rating from legacy challenge notes only', () => {
  const row = {
    id: 'difficulty-fixture', title: 'Fixture', author_username: 'author', source: '', status: 'submitted', review_note: '',
    bpm: 120, key_signature: 'C', time_signature: '4/4', final_notes: null,
  };
  for (const { pitches, level } of anchors) {
    for (const victory of [{}, {
      bpm: 200, key_signature: 'F#', final_bpm: 300, final_key_signature: 'Eb',
      final_notes: [{ midi: 40, beats: 1 }, { midi: 90, beats: 1 }], final_bass_notes: [{ midi: 32, beats: 4 }],
    }]) {
      const markup = renderToStaticMarkup(createElement(MelodyCard, {
        row: { ...row, ...victory, notes: pitches.map(midi => ({ midi, beats: 1 })) },
        audio: { playing: null }, children: null,
      }));
      assert.ok(markup.includes(`Difficulty: <strong>${level}</strong>`));
      assert.match(markup, /<summary>About this rating<\/summary>/);
    }
  }
});
