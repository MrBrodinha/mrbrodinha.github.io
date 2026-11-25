import assert from 'node:assert/strict';
import test from 'node:test';
import abcjs from 'abcjs';
import {studio,libraryUrl} from './studioModules.mjs';
import {musicUrl,victoryUrl,composerUrl,sourceUrl,playbackUrl} from './sheetEditorModules.mjs';
const music=await import(musicUrl),victory=await import(victoryUrl),library=await import(libraryUrl),composer=await import(composerUrl),playback=await import(playbackUrl);
const parser=await import(await sourceUrl('src/components/brodle/creator/melodyCode.ts',{'./melodyComposer':composerUrl,'../lib/musicGame':musicUrl,'../lib/victoryMusic':victoryUrl}));
const rating=await import(await sourceUrl('src/components/brodle/lib/melodyDifficulty.ts'));
import {expressiveDraft, score, finalSteps} from './studioExpressionFixtures.mjs';

test('expressions survive Studio, storage, code and published challenge boundaries',()=>{
 const draft=expressiveDraft();assert.equal(studio.studioSubmissionIssue(draft),'');
 const payload=studio.studioPayload(draft),restored=library.recordDraft(payload);
 assert.deepEqual(payload.notes[0].tieToNext,[60]);assert.equal(payload.notes[2].staccato,true);assert.equal(payload.final_notes[0].arpeggio,'down');assert.deepEqual(payload.final_notes[0].tieToNext,[60,64]);
 assert.deepEqual(studio.studioFromRecord(payload),draft);
 const code=composer.exportMelodyCode(restored),roundTrip=parser.parseMelodyCode(code);assert.deepEqual(roundTrip.melody,restored.melody);assert.deepEqual(roundTrip.finalMelody,restored.finalMelody);
 const snapshot={title:payload.title,source:payload.source,hint:payload.hint,author:'Author',bpm:120,key:'C',timeSignature:'4/4',melody:payload.notes,finalMelody:payload.final_notes};
 const challenge=library.publishedChallenge('daily','2026-11-26',snapshot);assert.deepEqual(challenge.melody[0].tieToNext,[60]);assert.equal(challenge.finalMelody[0].arpeggio,'down');
});

test('tied continuations share one guess and feedback index, including wrong and partial guesses',()=>{
 const notes=studio.studioPayload(expressiveDraft()).notes,restored=library.restoreNotes(notes);
 assert.deepEqual(music.melodyAttackIndices(restored),[0,0,1]);assert.equal(rating.rateMelody(restored).noteCount,2);
 const partial=music.melodyForGuess([61],restored);assert.deepEqual(partial.map(n=>n.midi),[61,61]);assert.deepEqual(partial[0].tieToNext,[61]);
 const notation=music.notationForGuess([61,63],'letters',restored,'C');assert.deepEqual(notation.guessIndices,[0,0,1]);assert.deepEqual(notation.noteIndices,[0,0,1]);
 assert.equal(music.getWinKind([60,64],[60,64]),'exact');
});

test('game hints and Victory playback preserve Studio tie sustain, staccato and arpeggio timing',()=>{
 const draft=expressiveDraft(),payload=studio.studioPayload(draft);
 for(const [track,notes] of [['main',payload.notes],['final',payload.final_notes]]){
  const source=playback.performanceTimeline(studio.studioSession(draft.document[track]).state.score),actual=victory.arrangementTimeline([notes],120);
  const tones=actual.events.flatMap(event=>event.pitches.map(midi=>({midi,time:event.time,duration:event.duration}))).sort((a,b)=>a.time-b.time||a.midi-b.midi);
  const expected=source.events.map(({midi,time,duration})=>({midi,time,duration})).sort((a,b)=>a.time-b.time||a.midi-b.midi);
  assert.deepEqual(tones,expected);assert.equal(actual.totalDuration,source.totalDuration);
 }
 const abc=music.melodyToAbc(library.restoreNotes(payload.notes),'letters','C',120);assert.match(abc,/C1-/);assert.match(abc,/\.E2/);
 const chordAbc=victory.victoryNotation(victory.restoreVictoryNotes(payload.final_notes),[],'letters','C',120,'4/4');assert.match(chordAbc,/!arpeggio!/);assert.match(chordAbc,/C-E-/);assert.ok(!abcjs.parseOnly(chordAbc)[0].warnings?.length);
});

test('invalid expressions and game chords are rejected without silently stripping metadata',()=>{
 for(const notes of [[{midi:60,beats:1,staccato:'yes'}],[{midi:null,beats:1,staccato:true}],[{midi:60,beats:1,arpeggio:'up'}],[{midi:60,beats:1,tieToNext:[60]}],[{midi:60,beats:1,tieToNext:[60]},{midi:61,beats:1}],[{midi:60,beats:1,tieToNext:[60,60]},{midi:60,beats:1}]])assert.throws(()=>victory.restoreVictoryNotes(notes));
 assert.throws(()=>library.restoreNotes([{midi:60,pitches:[60,64],beats:1}]));
 const draft=expressiveDraft();draft.document.main=studio.studioScoreDocument(score(finalSteps),null);assert.match(studio.studioSubmissionIssue(draft),/single notes/);
});
