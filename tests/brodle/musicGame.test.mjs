import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import abcjs from 'abcjs';

// Use the project's compiler so the tests also run on Node without TS support.
const source = await readFile(new URL('../../src/components/brodle/lib/musicGame.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const musicModuleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
const { toAbc, noteName, notationKey, getWinKind, melodyPitchHint, scoreGuess, buildShareText, melodyToAbc, melodyNotation, notationForGuess, TIME_SIGNATURES, beatsPerBar, melodyBeats, validateTriplets } = await import(musicModuleUrl);
const victorySource = await readFile(new URL('../../src/components/brodle/lib/victoryMusic.ts', import.meta.url), 'utf8');
const victoryJs = ts.transpileModule(victorySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText.replace(/from ['"]\.\/musicGame['"]/g, `from '${musicModuleUrl}'`);
const victoryUrl = `data:text/javascript;base64,${Buffer.from(victoryJs).toString('base64')}`;
const { restoreVictoryNotes, transposeVictory, arrangementTimeline, victoryNotation, victoryScore, victoryPianoRange } = await import(victoryUrl);
const composerSource = await readFile(new URL('../../src/components/brodle/creator/melodyComposer.ts', import.meta.url), 'utf8');
const composerJs = ts.transpileModule(composerSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText.replace(/from ['"]\.\.\/lib\/musicGame['"]/g, `from '${musicModuleUrl}'`).replace(/from ['"]\.\.\/lib\/victoryMusic['"]/g, `from '${victoryUrl}'`);
const { DURATIONS, makeStep, durationForStep, exportMelodyCode, parseComposerDraft, emptyComposerDraft, makeVictoryStep, victorySettings, changeStepDuration, finishTriplet } = await import(`data:text/javascript;base64,${Buffer.from(composerJs).toString('base64')}`);
const codeSource = await readFile(new URL('../../src/components/brodle/creator/melodyCode.ts', import.meta.url), 'utf8');
const codeJs = ts.transpileModule(codeSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
  .replace(/from ['"]\.\.\/lib\/musicGame['"]/g, `from '${musicModuleUrl}'`).replace(/from ['"]\.\.\/lib\/victoryMusic['"]/g, `from '${victoryUrl}'`);
const { parseMelodyCode } = await import(`data:text/javascript;base64,${Buffer.from(codeJs).toString('base64')}`);

const pattern = (notes) => notes.map((midi) => ({ midi, length: '1', beats: 1, rhythm: 'Quarter note' }));

test('shifted and octave hints direct the whole melody back toward the target pitch', () => {
  const target = [60, 64, 67];
  for (const offset of [-24, -12, -5, -1, 1, 5, 12, 24]) {
    const hint = melodyPitchHint(target.map((note) => note + offset), target);
    assert.equal(hint.direction, offset > 0 ? 'down' : 'up');
    assert.match(hint.text, offset > 0 ? /Too high.*lower/ : /Too low.*higher/);
    assert.equal(hint.text.includes('octave'), offset % 12 === 0);
  }
  for (const notes of [[], [60], [60, 64], target, [61, 64, 68]]) assert.equal(melodyPitchHint(notes, target), null);
});
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
  const notes = Array.from({ length: 73 }, (_, index) => index + 31);
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

test('Hard scores a consistent pitch or octave shift as higher/lower notes instead of a win', () => {
  const target = [60, 64, 67];
  for (const offset of [-24, -12, -5, -1, 1, 5, 12, 24]) {
    const notes = target.map((midi) => midi + offset);
    assert.equal(getWinKind(notes, target, true), null);
    assert.deepEqual(scoreGuess(notes, target, true), target.map(() => offset < 0 ? 'low' : 'high'));
  }
  assert.equal(getWinKind(target, target, true), 'exact');
  assert.deepEqual(scoreGuess(target, target, true), ['correct', 'correct', 'correct']);
  assert.deepEqual(scoreGuess([60, 76, 66], target, true), ['correct', 'high', 'low']);
});

test('Hard share results cannot report shifted or octave wins from legacy feedback', () => {
  const target = [60, 64, 67];
  const attempts = [2, -12].map((offset) => {
    const notes = target.map((midi) => midi + offset);
    return { notes, feedback: scoreGuess(notes, target) };
  });
  const share = buildShareText(attempts, target, 'https://example.com/brodle', 0, true);
  assert.match(share, /2 attempts so far/);
  assert.match(share, /1\. ↓↓↓\n2\. ↑↑↑/);
  assert.doesNotMatch(share, /shifted|octave|♪|↕|Melody found/);
  const won = buildShareText([...attempts, { notes: target, feedback: scoreGuess(target, target) }], target, 'https://example.com/brodle', 0, true);
  assert.match(won, /Exact pitch found in 3 attempts!/);
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
  assert.match(share, /\nHints used: 0\n/);
  const exact = buildShareText([shifted, octave, attempt(target)], target, url);
  assert.match(exact, /^Brodle 🎉\nExact pitch found in 3 attempts!/);
  assert.match(exact, /3\. ✓✓✓/);
  const hinted = buildShareText([
    { ...attempt([60, 63, 66]), hintsUsed: 1 },
    { ...attempt(target), hintsUsed: 1 },
  ], target, url);
  assert.match(hinted, /\nHints used: 1\n/, 'a persistent hint is counted once across attempts');
  assert.match(buildShareText([shifted], target, url, 1), /\nHints used: 1\n/, 'include hints revealed after the latest attempt');
});

test('every composer duration and dotted variant produces valid notes and rests', () => {
  for (const duration of DURATIONS) {
    for (const dotted of [false, true]) {
      for (const midi of [70, null]) {
        const step = makeStep(midi, duration.id, dotted);
        const tune = abcjs.parseOnly(melodyToAbc([step], 'letters', 'F', 96))[0];
        assert.equal(tune.metaText.tempo.bpm, 96);
        assert.equal(tune.setUpAudio({}).totalDuration, step.beats / 4);
        assert.deepEqual(soundingPitches(tune), midi === null ? [] : [midi]);
        assert.deepEqual(durationForStep(step), { duration: duration.id, dotted });
        assert.equal(step.beats, duration.beats * (dotted ? 1.5 : 1));
      }
    }
  }
});

test('demisemiquavers keep dotted timing and note selection across bar lines in every meter', () => {
  assert.deepEqual(DURATIONS.find((duration) => duration.id === 'thirty-second'), {
    id: 'thirty-second', label: 'Demisemiquaver', beats: .125, fraction: '1/32',
  });
  assert.equal(makeStep(60, 'thirty-second', false).length, '/8');
  assert.equal(makeStep(null, 'thirty-second', true).length, '3/16');
  const melody = [
    makeStep(60, 'thirty-second', true), makeStep(null, 'thirty-second', false),
    makeStep(62, 'whole', false), makeStep(null, 'thirty-second', true),
    makeStep(64, 'thirty-second', false),
  ];
  for (const meter of TIME_SIGNATURES) {
    const notation = melodyNotation(melody, 'letters', 'C', 120, meter);
    const tune = abcjs.parseOnly(notation.abc)[0];
    assert.equal(tune.warnings, undefined, meter);
    assert.equal(tune.setUpAudio({}).totalDuration, 4.625 / 4, meter);
    assert.deepEqual(soundingPitches(tune), [60, 62, 64], meter);
    assert.deepEqual([...new Set(notation.stepIndices)], [0, 1, 2, 3, 4], meter);
  }
  assert.deepEqual(arrangementTimeline([melody], 120), {
    events: [
      { pitches: [60], time: 0, duration: .09375 },
      { pitches: [62], time: .15625, duration: 2 },
      { pitches: [64], time: 2.25, duration: .0625 },
    ],
    totalDuration: 2.3125,
  });
});

test('authored notes and rests cross bar lines without changing their timing', () => {
  const melody = [makeStep(60, 'quarter', false), makeStep(62, 'whole', false), makeStep(null, 'whole', false), makeStep(70, 'sixteenth', true)];
  const abc = melodyToAbc(melody, 'letters', 'F', 144);
  const tune = abcjs.parseOnly(abc)[0];
  assert.match(abc, /D3- \| D1/);
  assert.equal(tune.setUpAudio({}).totalDuration, 9.375 / 4);
  assert.deepEqual(soundingPitches(tune), [60, 62, 70]);
  assert.equal(tune.warnings, undefined);
});

test('exported constants compile and preserve the authored melody exactly', async () => {
  const draft = { bpm: 132, key: 'Bb', timeSignature: '7/8', melody: [makeStep(70, 'sixteenth', true), makeStep(null, 'half', false), makeStep(71, 'whole', false)] };
  const code = exportMelodyCode(draft);
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const exported = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  assert.equal(exported.BPM, draft.bpm);
  assert.equal(exported.KEY, draft.key);
  assert.equal(exported.TIME_SIGNATURE, draft.timeSignature);
  assert.deepEqual(exported.MELODY, draft.melody);
  assert.match(code, /length: '3\/8'/);
});

test('composer drafts restore independently and reject damaged data', () => {
  const draft = { bpm: 180, key: 'F#m', timeSignature: '6/8', melody: [makeStep(null, 'eighth', false), makeStep(66, 'half', true)] };
  assert.deepEqual(parseComposerDraft(JSON.stringify(draft)), draft);
  for (const invalid of [null, '{broken', JSON.stringify({ ...draft, bpm: 0 }), JSON.stringify({ ...draft, key: 'Invalid' }), JSON.stringify({ ...draft, timeSignature: '0/0' }), JSON.stringify({ ...draft, melody: [{ midi: 104, beats: 1 }] })]) {
    assert.deepEqual(parseComposerDraft(invalid), emptyComposerDraft());
  }
});

test('all meters keep pitches, quarter-note tempo, and total playback duration unchanged', () => {
  const melody = [makeStep(60, 'quarter', false), makeStep(62, 'whole', false), makeStep(null, 'whole', false), makeStep(65, 'sixteenth', true)];
  for (const meter of TIME_SIGNATURES) {
    const tune = abcjs.parseOnly(melodyToAbc(melody, 'letters', 'C', 96, meter))[0];
    assert.equal(tune.getBarLength(), beatsPerBar(meter) / 4, meter);
    assert.equal(tune.metaText.tempo.bpm, 96, meter);
    assert.equal(tune.setUpAudio({}).totalDuration, 9.375 / 4, meter);
    assert.deepEqual(soundingPitches(tune), [60, 62, 65], meter);
    assert.equal(tune.warnings, undefined, meter);
  }
});

test('tied notes and split rests map to their original editable steps and scored pitches', () => {
  const melody = [makeStep(60, 'whole', false), makeStep(null, 'whole', false), makeStep(62, 'half', false)];
  const notation = melodyNotation(melody, 'letters', 'C', 120, '3/4', false);
  assert.deepEqual(notation.stepIndices, [0, 0, 1, 1, 2, 2]);
  assert.deepEqual(notation.noteIndices, [0, 0, 1, 1]);
  assert.doesNotMatch(notation.abc, /"_/);
  assert.deepEqual(soundingPitches(abcjs.parseOnly(notation.abc)[0]), [60, 62]);
  const guess = notationForGuess([61, 63], 'letters', melody, 'C', '3/4');
  assert.deepEqual(guess.noteIndices, [0, 0, 1, 1]);
  assert.deepEqual(soundingPitches(abcjs.parseOnly(guess.abc)[0]), [61, 63]);
});

test('guess selection skips rests and maps every tied fragment to the same guessed note', () => {
  const melody = [makeStep(null, 'quarter', false), makeStep(60, 'whole', false), makeStep(null, 'whole', false), makeStep(62, 'half', false), makeStep(null, 'quarter', false)];
  for (const meter of TIME_SIGNATURES) {
    for (const notes of [[], [61], [61, 63]]) {
      const notation = notationForGuess(notes, 'letters', melody, 'C', meter);
      const entries = abcjs.parseOnly(notation.abc)[0].lines.flatMap((line) => line.staff ?? [])
        .flatMap((staff) => staff.voices.flat()).filter((entry) => entry.el_type === 'note');
      // Empty notation contains a placeholder rest, which stays unselectable.
      if (!notes.length) { assert.deepEqual(notation.guessIndices, []); continue; }
      assert.equal(entries.length, notation.guessIndices.length, meter);
      assert.deepEqual([...new Set(notation.guessIndices.filter((index) => index !== null))], notes.map((_, index) => index), meter);
      assert.deepEqual(notation.guessIndices.filter((index) => index !== null), notation.noteIndices, meter);
      entries.forEach((entry, index) => assert.equal(notation.guessIndices[index] === null, Boolean(entry.rest), meter));
      assert.deepEqual(soundingPitches(abcjs.parseOnly(notation.abc)[0]), notes, meter);
    }
  }
});

test('legacy composer drafts keep their melody and default to 4/4', () => {
  const legacy = { bpm: 120, key: 'C', melody: [makeStep(60, 'quarter', false)] };
  assert.deepEqual(parseComposerDraft(JSON.stringify(legacy)), { ...legacy, timeSignature: '4/4' });
});

const librarySource = await readFile(new URL('../../src/components/brodle/lib/melodyLibrary.ts', import.meta.url), 'utf8');
const composerUrl = `data:text/javascript;base64,${Buffer.from(composerJs).toString('base64')}`;
const libraryJs = ts.transpileModule(librarySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
  .replace(/from ['"]\.\/musicGame['"]/g, `from '${musicModuleUrl}'`)
  .replace(/from ['"]\.\/victoryMusic['"]/g, `from '${victoryUrl}'`)
  .replace(/from ['"]\.\.\/creator\/melodyComposer['"]/g, `from '${composerUrl}'`);
const { restoreNotes, melodyPayload, recordDraft, publishedChallenge, lisbonDate } = await import(`data:text/javascript;base64,${Buffer.from(libraryJs).toString('base64')}`);
const progressSource = await readFile(new URL('../../src/components/brodle/lib/gameProgress.ts', import.meta.url), 'utf8');
const progressJs = ts.transpileModule(progressSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText.replace(/from ['"]\.\/musicGame['"]/g, `from '${musicModuleUrl}'`);
const { parseProgress, progressStorageKey } = await import(`data:text/javascript;base64,${Buffer.from(progressJs).toString('base64')}`);

test('32nd notes, rests and victory chords survive code, draft and daily-library round trips', () => {
  const draft = {
    ...emptyComposerDraft(),
    melody: [makeStep(60, 'thirty-second', false), makeStep(null, 'thirty-second', true)],
    finalMelody: [makeVictoryStep([60, 64, 67], 'thirty-second', true)],
    finalBass: [makeStep(null, 'thirty-second', false), makeVictoryStep([36], 'thirty-second', true)],
    finalClef: 'treble', finalBassClef: 'bass',
  };
  assert.deepEqual(parseComposerDraft(JSON.stringify(draft)), draft);
  assert.deepEqual(parseMelodyCode(exportMelodyCode(draft)), draft);
  const payload = melodyPayload(draft);
  assert.deepEqual(restoreNotes(payload.notes), draft.melody);
  assert.deepEqual(restoreVictoryNotes(payload.final_notes), draft.finalMelody);
  assert.deepEqual(restoreVictoryNotes(payload.final_bass_notes), draft.finalBass);
  const challenge = publishedChallenge('32nd-day', '2026-11-01', { ...draft, title: '32nd tune', source: '', hint: '', author: 'Composer' });
  assert.deepEqual(challenge.melody, draft.melody);
  assert.deepEqual(challenge.finalMelody, draft.finalMelody);
  assert.deepEqual(challenge.finalBass, draft.finalBass);
  const score = victoryNotation(draft.finalMelody, draft.finalBass, 'letters', 'C', 120, '4/4');
  const tune = abcjs.parseOnly(score)[0];
  assert.equal(tune.warnings, undefined);
  assert.equal(tune.setUpAudio({}).totalDuration, .3125 / 4);
});

test('cloud melody data round-trips metadata, dotted rests and an optional victory melody', () => {
  const draft = { title:'My tune',source:'An artist',hint:'A clue',bpm:96,key:'F',timeSignature:'3/4',
    melody:[makeStep(70,'quarter',true),makeStep(null,'sixteenth',true)],finalMelody:[makeStep(71,'whole',true)] };
  assert.deepEqual(parseComposerDraft(JSON.stringify(draft)),draft);
  const stored=melodyPayload(draft);
  assert.deepEqual(stored.notes,[{midi:70,beats:1.5},{midi:null,beats:.375}]);
  assert.deepEqual(restoreNotes(stored.notes),draft.melody);
  assert.deepEqual(restoreNotes(stored.final_notes),draft.finalMelody);
  assert.match(exportMelodyCode(draft),/export const MELODY_FINAL/);
});
test('malformed cloud notes are rejected instead of becoming an empty published melody', () => {
  for (const raw of [null,{},[{midi:104,beats:1}],[{midi:60}],[{beats:1}],[{midi:60,beats:.7}],Array(257).fill({midi:60,beats:1})]) assert.throws(()=>restoreNotes(raw));
});
test('published challenges use their own target, meter, key and tempo', () => {
  const snapshot={title:'Daily tune',source:'Artist',hint:'Hint',author:'Composer',bpm:96,key:'F',timeSignature:'3/4',melody:[{midi:70,beats:1.5},{midi:null,beats:.5},{midi:71,beats:1}],finalMelody:[]};
  const challenge=publishedChallenge('daily-id','2026-11-01',snapshot);
  assert.deepEqual(challenge.finalMelody,challenge.melody);
  assert.equal(challenge.finalBpm,96);
  assert.equal(challenge.finalKey,'F');
  const notation=notationForGuess([70,71],'letters',challenge.melody,challenge.key,challenge.timeSignature,challenge.bpm);
  const tune=abcjs.parseOnly(notation.abc)[0];
  assert.equal(tune.metaText.tempo.bpm,96);
  assert.equal(tune.getBarLength(),.75);
  assert.deepEqual(soundingPitches(tune),[70,71]);
  const progress=parseProgress(JSON.stringify({guess:[],attempts:[[58,59],[70,71]],selectedAttempt:1}),[70,71],'classic');
  assert.deepEqual(progress.attempts.map(a=>a.feedback),[['low','low'],['correct','correct']]);
  assert.notEqual(progressStorageKey('day-a',[70,71]),progressStorageKey('day-b',[70,71]));
});

test('independent challenge and victory settings survive browser, code, cloud and publication', () => {
  const draft = { ...emptyComposerDraft(), title: 'Two tempos', source: '', hint: '', bpm: 96, key: 'F', finalBpm: 144, finalKey: 'Am',
    melody: [makeStep(70, 'quarter', false)], finalMelody: [makeVictoryStep([69,72,76], 'half', false)],
    finalBass: [makeStep(45, 'whole', false)], finalClef: 'treble', finalBassClef: 'bass' };
  assert.deepEqual(parseComposerDraft(JSON.stringify(draft)), draft);
  const imported = parseMelodyCode(exportMelodyCode(draft));
  assert.equal(imported.bpm, 96);
  assert.equal(imported.key, 'F');
  assert.equal(imported.finalBpm, 144);
  assert.equal(imported.finalKey, 'Am');
  const stored = melodyPayload(draft);
  assert.equal(stored.final_bpm, 144);
  assert.equal(stored.final_key_signature, 'Am');
  const restored = recordDraft(stored);
  assert.deepEqual(restored, draft);
  const challenge = publishedChallenge('two-tempos', '2026-11-01', { ...restored, author: 'Composer' });
  const final = victorySettings(challenge);
  const mainScore = abcjs.parseOnly(melodyToAbc(challenge.melody, 'letters', challenge.key, challenge.bpm, challenge.timeSignature))[0];
  const finalScore = abcjs.parseOnly(victoryNotation(challenge.finalMelody, challenge.finalBass, 'letters', final.key, final.bpm, challenge.timeSignature))[0];
  assert.equal(mainScore.metaText.tempo.bpm, 96);
  assert.equal(finalScore.metaText.tempo.bpm, 144);
  assert.deepEqual(soundingPitches(mainScore), [70]);
  assert.deepEqual(soundingPitches(finalScore).sort((a,b)=>a-b), [45,69,72,76]);
  assert.match(victoryNotation(challenge.finalMelody, challenge.finalBass, 'letters', final.key, final.bpm, challenge.timeSignature), /K:Am/);
  assert.equal(arrangementTimeline([challenge.finalMelody, challenge.finalBass], final.bpm).totalDuration, 4 * 60 / 144);
  const inheritedNotes = publishedChallenge('reused-notes', '2026-11-01', { ...restored, finalMelody: [], finalBass: [], author: 'Composer' });
  assert.deepEqual(inheritedNotes.finalMelody, inheritedNotes.melody);
  assert.deepEqual(victorySettings(inheritedNotes), { bpm: 144, key: 'Am' });
});

test('older code and cloud records inherit their challenge settings; invalid victory settings are rejected', () => {
  const legacy = { melody: [makeStep(70, 'quarter', false)], bpm: 96, key: 'F', timeSignature: '3/4' };
  assert.deepEqual(victorySettings(parseComposerDraft(JSON.stringify(legacy))), { bpm: 96, key: 'F' });
  assert.deepEqual(victorySettings(parseMelodyCode(exportMelodyCode(legacy))), { bpm: 96, key: 'F' });
  const stored = { ...melodyPayload(legacy), final_bpm: null, final_key_signature: null };
  assert.deepEqual(victorySettings(recordDraft(stored)), { bpm: 96, key: 'F' });
  for (const bad of [{ finalBpm: 19 }, { finalBpm: 401 }, { finalBpm: 120.5 }, { finalKey: 'H' }]) {
    const invalid = { ...legacy, ...bad };
    assert.deepEqual(parseComposerDraft(JSON.stringify(invalid)), emptyComposerDraft());
    assert.throws(() => parseMelodyCode(exportMelodyCode(invalid)));
    assert.throws(() => melodyPayload(invalid));
    const snapshot = { ...invalid, title: 'Invalid', source: '', hint: '', author: 'Composer', finalMelody: [] };
    assert.throws(() => publishedChallenge('invalid', '2026-11-01', snapshot));
  }
});
test('Lisbon dates respect winter and summer clock offsets', () => {
  assert.equal(lisbonDate(new Date('2026-07-01T23:30:00Z')),'2026-07-02');
  assert.equal(lisbonDate(new Date('2026-12-01T23:30:00Z')),'2026-12-01');
});

test('victory chords and bass parts round-trip without allowing polyphonic challenges', () => {
  const chord=makeVictoryStep([67,60,64], 'quarter', true);
  const bass=makeVictoryStep([36], 'whole', false);
  assert.deepEqual(chord.pitches,[60,64,67]);
  const draft={...emptyComposerDraft(),melody:[makeStep(60,'quarter',false)],finalMelody:[chord],finalBass:[bass],finalClef:'treble',finalBassClef:'bass'};
  assert.deepEqual(parseComposerDraft(JSON.stringify(draft)),draft);
  const payload=melodyPayload(draft);
  assert.deepEqual(payload.final_notes,[{midi:60,beats:1.5,pitches:[60,64,67]}]);
  assert.deepEqual(payload.final_bass_notes,[{midi:36,beats:4}]);
  assert.throws(()=>restoreNotes([chord]));
  for(const bad of [[{midi:null,pitches:[60,64],beats:1}],[{midi:60,pitches:[60,60],beats:1}],[{midi:60,pitches:[64,60],beats:1}],[{midi:60,pitches:[60,104],beats:1}]])assert.throws(()=>restoreVictoryNotes(bad));
  assert.match(exportMelodyCode(draft),/MELODY_FINAL_BASS/);
});
test('two victory parts begin together, preserve rests, and finish at the longest part', () => {
  const main=[makeVictoryStep([60,64,67],'quarter',true),makeStep(null,'eighth',false),makeVictoryStep([62],'quarter',false)];
  const bass=[makeVictoryStep([36],'whole',false)];
  const timeline=arrangementTimeline([main,bass],120);
  assert.deepEqual(timeline.events.map(e=>[e.time,e.pitches]),[[0,[60,64,67]],[0,[36]],[1,[62]]]);
  assert.equal(timeline.totalDuration,2);
  assert.deepEqual(transposeVictory(main,12)[0].pitches,[72,76,79]);
  assert.equal(transposeVictory(bass,12)[0].midi,48);
  assert.equal(transposeVictory(main,12)[1].midi,null);
});
test('victory notation renders treble and bass staves with literal pitches and tied chords', () => {
  const main=[makeVictoryStep([70,71,74],'whole',false),makeVictoryStep([72],'quarter',false)];
  const bass=[makeVictoryStep([36,43],'half',true)];
  const abc=victoryNotation(main,bass,'letters','F',96,'3/4');
  assert.match(abc,/V:lower clef=bass/);
  assert.match(abc,/\[.*\]3-/);
  const tune=abcjs.parseOnly(abc)[0];
  assert.equal(tune.warnings,undefined);
  assert.equal(tune.lines[0].staff.length,2);
  assert.deepEqual(soundingPitches(tune).sort((a,b)=>a-b),[36,43,70,71,72,74]);
  const bassOnly=abcjs.parseOnly(victoryNotation(bass,[],'letters','C',96,'4/4','bass'))[0];
  assert.equal(bassOnly.lines[0].staff[0].clef.type,'bass');
  assert.deepEqual(soundingPitches(bassOnly),[36,43]);
});

test('editable code round-trips all parts and recalculates labels from beats', () => {
  const draft = { melody: [makeStep(60, 'quarter', false), makeStep(null, 'eighth', true)], bpm: 132, key: 'F', timeSignature: '3/4',
    finalMelody: [makeVictoryStep([60,64,67], 'whole', true)], finalBass: [makeVictoryStep([36], 'half', false)], finalClef: 'bass', finalBassClef: 'treble' };
  assert.deepEqual(parseMelodyCode(exportMelodyCode(draft)), draft);
  const edited = parseMelodyCode('// Literal code editing\n' + exportMelodyCode(draft).replace('BPM = 132', 'BPM = 95').replace('midi: 60, length', 'midi: 62, length').replace('beats: 1,', 'beats: 2,'));
  assert.equal(edited.bpm, 95);
  assert.deepEqual(edited.melody[0], makeStep(62, 'half', false));
  assert.deepEqual(edited.finalBass, draft.finalBass);
  const basic = parseMelodyCode(`const BPM = 120; const KEY = "C"; const TIME_SIGNATURE = '4/4'; const MELODY = [{"midi":null,"beats":.5}, {midi: 60, beats: 1,},];`);
  assert.deepEqual(basic.melody, [makeStep(null, 'eighth', false), makeStep(60, 'quarter', false)]);
  assert.deepEqual(basic.finalMelody, []);
  assert.deepEqual(basic.finalBass, []);
});

test('code edits reject executable expressions and invalid or ambiguous data', () => {
  const code = exportMelodyCode({ ...emptyComposerDraft(), melody: [makeStep(60, 'quarter', false)] });
  for (const invalid of [
    code.replace('BPM = 120', 'BPM = alert(1)'), code + '\nglobalThis.compromised = true;', code + '\nconst BPM = 80;',
    code.replace('BPM = 120', 'BPM = 0'), code.replace("'C'", "'H'"), code.replace("'4/4'", "'0/0'"),
    code.replace('midi: 60', 'midi: 30'), code.replace('beats: 1', 'beats: 1.1'), code.replace('midi: 60', 'midi: 60, pitches: [60, 64]'),
    code.replace('midi: 60', 'midi: 60, midi: 62'), code.replace('midi: 60', '__proto__: null, midi: 60'),
    code.replace(/export const MELODY[\s\S]*/, 'const MELODY = null;'), code.replace(/export const MELODY[\s\S]*/, 'const MELODY = [{ midi: 60, beats: 1 }]; const MELODY_FINAL = null;'),
    code.replace('export const BPM = 120;', ''), code + "\nconst FINAL_CLEF = 'alto';",
    code + '\nconst MELODY_FINAL = [{midi:60,pitches:[64,60],beats:1}];',
    code.replace(/export const MELODY[\s\S]*/, `const MELODY = [${Array.from({length:257},()=>'{midi:60,beats:1}').join(',')}];`),
  ]) assert.throws(() => parseMelodyCode(invalid), undefined, invalid);
  assert.equal(globalThis.compromised, undefined);
});

test('staff selection maps tied chords, authored rests and padding to their original parts', () => {
  const main = [makeVictoryStep([60], 'quarter', false), makeVictoryStep([60,64,67], 'whole', false)];
  const bass = [makeVictoryStep([], 'half', false), makeVictoryStep([36], 'eighth', false)];
  const score = victoryScore(main, bass, 'letters', 'F', 120, '3/4');
  assert.deepEqual(score.stepIndices[0], [0,1,1]);
  assert.equal(score.stepIndices[1][0], 0);
  assert.equal(score.stepIndices[1][1], 1);
  assert.ok(score.stepIndices[1].slice(2).every(index=>index===null));
  assert.deepEqual(soundingPitches(abcjs.parseOnly(score.abc)[0]), [60,60,64,67,36]);
});

test('G1–G7 boundaries survive keyboard, code, draft, cloud and game-progress restoration', async () => {
  const { keyboardKeys, PIANO_MIN_MIDI, PIANO_MAX_MIDI } = await import(musicModuleUrl);
  assert.equal(PIANO_MIN_MIDI, 31);
  assert.equal(PIANO_MAX_MIDI, 103);
  const pitches = [...keyboardKeys().whiteKeys, ...keyboardKeys().blackKeys].map(note => note.midi).sort((a,b)=>a-b);
  assert.deepEqual(pitches, Array.from({length:73}, (_,index)=>31+index));
  assert.equal(noteName(31), 'G1');
  assert.equal(noteName(103), 'G7');
  const draft = { ...emptyComposerDraft(), melody: [makeStep(31,'quarter',false),makeStep(103,'quarter',false)], finalMelody: [makeVictoryStep([31,103],'half',false)], finalBass: [makeStep(31,'whole',false)] };
  assert.deepEqual(parseComposerDraft(JSON.stringify(draft)),draft);
  assert.deepEqual(parseMelodyCode(exportMelodyCode(draft)).melody,draft.melody);
  const payload = melodyPayload(draft);
  assert.deepEqual(restoreNotes(payload.notes),draft.melody);
  assert.deepEqual(restoreVictoryNotes(payload.final_notes),draft.finalMelody);
  assert.deepEqual(parseProgress(JSON.stringify({guess:[31,103],attempts:[]}),[60,64]).guess,[31,103]);
  assert.deepEqual(parseProgress(JSON.stringify({guess:[],attempts:[[31,103]]}),[31,103]).attempts[0].feedback,['correct','correct']);
  for (const invalid of [30,104]) {
    assert.throws(()=>restoreNotes([{midi:invalid,beats:1}]));
    assert.throws(()=>restoreVictoryNotes([{midi:invalid,beats:1}]));
    assert.deepEqual(parseProgress(JSON.stringify({guess:[invalid],attempts:[]}),[60]).guess,[]);
  }
});

test('game keyboards start on the lower C and end on the higher B outside the melody', async () => {
  const { challengePianoRange, keyboardKeys } = await import(musicModuleUrl);
  for (const [target, expected] of [
    [[72, 84], { minMidi: 60, maxMidi: 95 }], // C5–C6 → C4–B6
    [[67, 91], { minMidi: 60, maxMidi: 95 }], // G4–G6 → C4–B6
    [[67, 84], { minMidi: 60, maxMidi: 95 }],
    [[72, 91], { minMidi: 60, maxMidi: 95 }],
    [[60, 67, 64], { minMidi: 48, maxMidi: 71 }],
    [[60, 60], { minMidi: 48, maxMidi: 71 }],
    [[31, 36], { minMidi: 24, maxMidi: 47 }],
    [[100, 103], { minMidi: 96, maxMidi: 107 }],
    [[66, 70], { minMidi: 60, maxMidi: 71 }],
    [[71, 83], { minMidi: 60, maxMidi: 95 }], // B4–B5 → C4–B6
    [[], { minMidi: 24, maxMidi: 107 }],
  ]) {
    const range = challengePianoRange(target);
    assert.deepEqual(range, expected);
    const keys = keyboardKeys(range.minMidi, range.maxMidi);
    const pitches = [...keys.whiteKeys, ...keys.blackKeys].map(key => key.midi).sort((a,b) => a-b);
    assert.deepEqual(pitches, Array.from({ length: range.maxMidi - range.minMidi + 1 }, (_,index) => range.minMidi + index));
  }
  for (let midi = 31; midi <= 103; midi++) {
    const { minMidi, maxMidi } = challengePianoRange([midi]);
    assert.ok(minMidi < midi && maxMidi > midi, 'the target always stays inside the keyboard');
    assert.equal(minMidi % 12, 0, 'the first key is C');
    assert.equal(maxMidi % 12, 11, 'the last key is B');
  }
  assert.equal(keyboardKeys().whiteKeys.length + keyboardKeys().blackKeys.length, 73, 'Studio retains the full piano');
});

test('victory playback fits both parts and every chord pitch, rounding only black-key edges outward', () => {
  const main = [{ midi: 64, pitches: [64,68,85], beats: 1 }, { midi: null, beats: 1 }];
  const bass = [{ midi: 37, pitches: [37,49], beats: 2 }];
  assert.deepEqual(victoryPianoRange([main,bass]), { minMidi: 36, maxMidi: 86 }, 'include low bass and high chord members beyond the challenge range');
  assert.deepEqual(victoryPianoRange([[{midi:48,beats:1},{midi:84,beats:1}]]), { minMidi:48,maxMidi:84 }, 'white-key endpoints need no extra padding');
  assert.deepEqual(victoryPianoRange([[{midi:60,beats:1}]]), { minMidi:60,maxMidi:60 });
  assert.deepEqual(victoryPianoRange([[{midi:61,beats:1}]]), { minMidi:60,maxMidi:62 });
  assert.deepEqual(victoryPianoRange([[{midi:31,beats:1},{midi:103,beats:1}]]), { minMidi:31,maxMidi:103 });
  assert.equal(victoryPianoRange([[],[{midi:null,beats:4}]]), null, 'all-rest arrangements have no pitch range');
});

test('Casual victory transposition keeps both parts, chords, rests and timing at the winning pitch', async () => {
  const { keyboardKeys } = await import(musicModuleUrl);
  const target = [90, 94, 97];
  const main = [makeVictoryStep([60,64,67], 'quarter', true), makeStep(null, 'eighth', false), makeStep(72, 'half', false)];
  const bass = [makeVictoryStep([31,43], 'whole', false)];
  const parts = [main, bass];
  const original = structuredClone(parts);
  const authored = arrangementTimeline(parts, 144);
  for (const offset of [-48, -24, -12, -2, 0, 2, 6]) {
    const guess = target.map((midi) => midi + offset);
    assert.ok(getWinKind(guess, target));
    const victory = parts.map((part) => transposeVictory(part, guess[0] - target[0]));
    const played = arrangementTimeline(victory, 144);
    assert.equal(played.totalDuration, authored.totalDuration);
    assert.deepEqual(played.events.map(({ time, duration }) => ({ time, duration })), authored.events.map(({ time, duration }) => ({ time, duration })));
    assert.deepEqual(played.events.map(({ pitches }) => pitches), authored.events.map(({ pitches }) => pitches.map((pitch) => pitch + offset)));
    assert.deepEqual(victory[0][1], main[1], 'rests keep their timing and never become pitches');
    const range = victoryPianoRange(victory);
    const keys = keyboardKeys(range.minMidi, range.maxMidi);
    const pitches = new Set([...keys.whiteKeys, ...keys.blackKeys].map(({ midi }) => midi));
    assert.ok(played.events.every((event) => event.pitches.every((pitch) => pitches.has(pitch))));
    assert.ok([...keys.whiteKeys, ...keys.blackKeys].every(({ name }) => !name.includes('undefined')));
  }
  assert.deepEqual(parts, original, 'victory playback never rewrites the published arrangement');
});

// Read the renderer's parsed durations directly. Brodle plays its own timeline;
// abcjs' optional MIDI sequencer includes bar records when counting tied tuplets.
function parsedDuration(tune) {
  let multiplier = 1;
  return tune.lines.flatMap(line => line.staff?.[0]?.voices[0] ?? []).reduce((sum, element) => {
    if (element.startTriplet) multiplier = element.tripletMultiplier;
    const duration = element.duration ? element.duration * multiplier : 0;
    if (element.endTriplet) multiplier = 1;
    return sum + duration;
  }, 0);
}

test('eighth and quarter triplets render and play exactly across bar lines in every meter', () => {
  for (const duration of ['eighth', 'quarter']) {
    for (const meter of TIME_SIGNATURES) {
      for (const lead of [[], [makeStep(61, 'sixteenth', true)], [makeStep(null, 'half', true)]]) {
        const group = [60, null, 67].map((midi, index) => makeStep(midi, duration, false, index + 1));
        const notes = [...lead, ...group, makeStep(65, 'quarter', false)];
        const score = melodyNotation(notes, 'letters', 'C', 120, meter, false);
        const tune = abcjs.parseOnly(score.abc)[0];
        assert.equal(tune.warnings, undefined, score.abc);
        assert.match(score.abc, /\(3:2:/);
        const expected = melodyBeats(notes);
        assert.ok(Math.abs(parsedDuration(tune) - expected / 4) < 1e-8, score.abc);
        assert.equal(arrangementTimeline([notes], 120).totalDuration, expected / 2);
        assert.deepEqual(soundingPitches(tune), notes.filter(step => step.midi !== null).map(step => step.midi), score.abc);
        assert.deepEqual([...new Set(score.stepIndices)], notes.map((_, index) => index));
      }
    }
  }
  const notes = Array.from({ length: 300 }, (_, index) => makeStep(60, 'eighth', false, index % 3 + 1));
  assert.equal(melodyBeats(notes), 100);
  assert.equal(arrangementTimeline([notes], 120).totalDuration, 50);
});

test('triplets, rests and chords survive browser, code, cloud and published snapshots', () => {
  const draft = { ...emptyComposerDraft(),
    finalClef: 'treble', finalBassClef: 'bass',
    melody: [60, null, 67].map((midi, index) => makeStep(midi, 'eighth', false, index + 1)),
    finalMelody: [[60, 64, 67], [], [62, 65, 69]].map((pitches, index) => makeVictoryStep(pitches, 'quarter', false, index + 1)),
    finalBass: [36, 43, 48].map((midi, index) => makeStep(midi, 'eighth', false, index + 1)),
  };
  assert.deepEqual(parseComposerDraft(JSON.stringify(draft)), draft);
  assert.deepEqual(parseMelodyCode(exportMelodyCode(draft)), draft);
  const payload = melodyPayload(draft);
  assert.deepEqual(restoreNotes(payload.notes), draft.melody);
  assert.deepEqual(restoreVictoryNotes(payload.final_notes), draft.finalMelody);
  assert.deepEqual(restoreVictoryNotes(payload.final_bass_notes), draft.finalBass);
  const row = { ...payload, title: '', source: '', hint: '' };
  assert.deepEqual(recordDraft(row), { ...draft, title: '', source: '', hint: '', finalClef: 'treble', finalBassClef: 'bass' });
  const challenge = publishedChallenge('triplets', '2026-11-11', { ...draft, title: 'Triplets', source: '', hint: '', author: 'Composer', melody: payload.notes, finalMelody: payload.final_notes, finalBass: payload.final_bass_notes });
  assert.deepEqual(challenge.melody, draft.melody);
  assert.deepEqual(challenge.finalMelody, draft.finalMelody);
  assert.deepEqual(challenge.finalBass, draft.finalBass);
  const score = victoryScore(draft.finalMelody, draft.finalBass, 'letters', 'C', 120, '4/4');
  const tune = abcjs.parseOnly(score.abc)[0];
  assert.equal(tune.warnings, undefined);
  assert.ok(Math.abs(tune.setUpAudio({}).totalDuration - .5) < 1e-8);
  const timeline = arrangementTimeline([draft.finalMelody, draft.finalBass], 120);
  assert.equal(timeline.totalDuration, 1);
  assert.deepEqual(timeline.events.map(event => [event.time, event.pitches]), [[0, [60,64,67]], [0, [36]], [1/6, [43]], [1/3, [48]], [2/3, [62,65,69]]]);
  const shifted = draft.finalMelody.map(step => ({ ...step, midi: step.midi === null ? null : step.midi + 12, ...(step.pitches ? { pitches: step.pitches.map(pitch => pitch + 12) } : {}) }));
  assert.deepEqual(transposeVictory(draft.finalMelody, 12), shifted);
  const guess = notationForGuess([60], 'letters', draft.melody, 'C', '4/4', 120);
  assert.ok(Math.abs(parsedDuration(abcjs.parseOnly(guess.abc)[0]) - (1/3)/4) < 1e-8);
});

test('triplet edits keep groups together, unfinished browser drafts resume and invalid groups are rejected', () => {
  const group = [makeStep(60, 'eighth', false, 1), makeStep(null, 'eighth', false, 2), makeVictoryStep([64,67], 'eighth', false, 3)];
  const edited = changeStepDuration(group, 1, 'quarter', false);
  assert.deepEqual(edited.map(step => [step.beats, step.triplet]), [[1,1], [1,2], [1,3]]);
  assert.deepEqual(edited[2].pitches, [64,67]);
  validateTriplets(edited, true);
  assert.equal(melodyBeats(edited), 2);
  const partial = group.slice(0, 1);
  const draft = { ...emptyComposerDraft(), melody: partial };
  assert.deepEqual(parseComposerDraft(JSON.stringify(draft)).melody, partial);
  assert.equal(melodyBeats(finishTriplet(partial)), 1);
  assert.deepEqual(finishTriplet(partial).map(step => [step.midi, step.triplet]), [[60,1], [null,2], [null,3]]);
  assert.throws(() => melodyPayload(draft), /Complete each triplet/);
  assert.throws(() => parseMelodyCode(exportMelodyCode(draft)));
  for (const bad of [
    [{ midi: 60, beats: .5, triplet: 2 }],
    [{ midi: 60, beats: .5, triplet: 1 }, { midi: 60, beats: 1 }],
    [{ midi: 60, beats: .5, triplet: 1 }, { midi: 60, beats: 1, triplet: 2 }],
    [{ midi: 60, beats: .75, triplet: 1 }],
    ...[0,4,null,'1',1.5].map(triplet => [{ midi:60, beats:.5, triplet }]),
  ]) assert.throws(() => restoreVictoryNotes(bad));
  assert.throws(() => makeStep(60, 'quarter', true, 1));
  assert.throws(() => makeStep(60, 'half', false, 1));
  assert.throws(() => validateTriplets([makeStep(null, 'thirty-second', true), ...group], true), /dotted 32nd/);
});

test('unfinished victory triplets display only authored entries while both parts play for their exact durations', () => {
  for (const duration of ['eighth','quarter']) {
    const main = [makeStep(60,duration,false,1)];
    const bass = [makeStep(36,'quarter',false)];
    const score = victoryScore(main,bass,'letters','C',120,'4/4');
    const tune = abcjs.parseOnly(score.abc)[0];
    assert.equal(tune.warnings,undefined,score.abc);
    assert.match(score.abc,/\(3:2:1/);
    assert.ok(Math.abs(parsedDuration(tune) - melodyBeats(main) / 4) < 1e-8,score.abc);
    assert.deepEqual(score.stepIndices,[[0],[0]]);
    assert.equal(arrangementTimeline([main,bass],120).totalDuration,.5);
  }
});
