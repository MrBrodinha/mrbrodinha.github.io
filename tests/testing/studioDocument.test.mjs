import assert from 'node:assert/strict';
import test from 'node:test';
import { studio, libraryUrl } from './studioModules.mjs';
import { codeUrl, scoreModel, model, parserUrl } from './sheetEditorModules.mjs';
const { scoreCodeSnapshot } = await import(codeUrl), { parseSheetCode } = await import(parserUrl);
const { melodyEditorPath, recordDraft } = await import(libraryUrl);
const scoreCode = (steps, options={}) => {
 const score=scoreModel.importScore(scoreModel.initialScore(),{bpm:120,key:'C',staffs:[{id:'staff-1',clef:'treble',steps}],...options},'test');
 assert.ok(score);return scoreCodeSnapshot(score).code;
};
export const ready = () => ({...studio.emptyStudioDraft(),title:'A melody',source:'An artist'});
test('lossless two-score documents retain unapplied drafts, advanced symbols and independent session histories',()=>{
 const draft=ready();delete draft.document.main.notation;draft.document.main.score=scoreCode([{midi:60,duration:'quarter',staccato:true},{midi:null,duration:'half',dotted:true}]);
 draft.document.main.codeDraft='unfinished source';
 const saved=studio.parseStudioDraft(JSON.parse(JSON.stringify(draft)));assert.deepEqual(saved,draft);
 const main=studio.studioSession(saved.document.main),final=studio.studioSession(saved.document.final);
 assert.equal(main.state.score.staffs[0].events[0].staccato,true);assert.equal(main.codeDraft,'unfinished source');assert.equal(final.state.score.staffs[0].events.every(e=>e.midi===null),true);assert.deepEqual(main.state.past,[]);
 assert.match(studio.studioSubmissionIssue(saved),/Apply or reset/);assert.deepEqual(studio.studioPayload(saved).studio_document,draft.document);
});
test('bounded source restoration rejects damaged or executable content without evaluating it',()=>{
 for(const change of [d=>d.document.version=2,d=>d.title='x'.repeat(161),d=>d.document.main.score='globalThis.executed=true',d=>d.document.final.codeDraft='x'.repeat(100001)]){
  const draft=ready();change(draft);assert.throws(()=>studio.parseStudioDraft(draft));
 }
 assert.equal(globalThis.executed,undefined);
});
test('compatible Main and Final scores produce the existing Brodle payload and exact review round trip',()=>{
 const draft=ready();delete draft.document.main.notation;draft.document.main.score=scoreCode([{midi:60,duration:'quarter'},{midi:64,duration:'quarter'},{midi:67,duration:'half'}]);
 delete draft.document.final.notation;draft.document.final.score=scoreCode([{midi:60,pitches:[60,64,67],duration:'whole'}],{bpm:90,key:'F',staffs:[{id:'top',clef:'treble',steps:[{midi:60,pitches:[60,64,67],duration:'whole'}]},{id:'low',clef:'bass',steps:[{midi:36,duration:'whole'}]}]});
 assert.equal(studio.studioSubmissionIssue(draft),'');const payload=studio.studioPayload(draft);
 assert.deepEqual(payload.notes.map(n=>n.midi),[60,64,67]);assert.deepEqual(payload.final_notes[0].pitches,[60,64,67]);assert.equal(payload.final_bass_notes[0].midi,36);assert.equal(payload.final_bpm,90);
 assert.deepEqual(studio.studioFromRecord({...payload}),draft);assert.equal(recordDraft(payload).melody[0].midi,60);
 assert.equal(melodyEditorPath(payload,'id','row'),'/brodle/create?id=row');assert.equal(melodyEditorPath(payload,'copy','row'),'/brodle/create?copy=row');assert.equal(melodyEditorPath({},'copy','row'),'/brodle/create/classic?copy=row');assert.equal(melodyEditorPath({},'id','row'),'/brodle/create/classic?id=row');
});
test('written triplets and dotted tempo units keep performed timing in the game payload',()=>{
 const draft=ready();delete draft.document.main.notation;draft.document.main.score=scoreCode([1,2,3].map((index)=>({midi:60+index,duration:'quarter',tuplet:{id:'t',count:3,inTimeOf:2,index}})).concat([{midi:null,duration:'half'}]),{bpm:60,tempoBeat:{duration:'half',dotted:true}});
 assert.equal(studio.studioSubmissionIssue(draft),'');const payload=studio.studioPayload(draft);
 assert.deepEqual(payload.notes.slice(0,3).map(n=>n.triplet),[1,2,3]);assert.equal(payload.bpm,180);
 const restored=studio.studioSession(draft.document.main).state.score;assert.equal(model.totalTicks(restored.staffs[0].events),model.MEASURE_TICKS);
});
test('unsupported music stays saved but cannot be silently simplified for Brodle',()=>{
 for(const [steps,options,issue] of [
  [[{midi:60,pitches:[60,64],duration:'whole'}],{},/single notes/],
  [[{midi:24,duration:'whole'}],{},/G1 and G7/],
  [[{midi:60,duration:'whole'}],{staffs:[{id:'a',clef:'treble',steps:[{midi:60,duration:'whole'}]},{id:'b',clef:'bass',steps:[{midi:36,duration:'whole'}]}]},/one staff/],
 ]){
  const draft=ready();delete draft.document.main.notation;draft.document.main.score=scoreCode(steps,options);assert.match(studio.studioSubmissionIssue(draft),issue);const payload=studio.studioPayload(draft);assert.deepEqual(payload.notes,[]);assert.equal(payload.studio_document.main.score,draft.document.main.score);
 }
});
test('empty Final melody reuses the challenge, and titles/unapplied source prevent submission only',()=>{
 const draft=ready();assert.match(studio.studioSubmissionIssue(draft),/Add a note/);draft.title='';assert.match(studio.studioSubmissionIssue(draft),/title/);assert.equal(studio.studioPayload(draft).title,'');
 draft.title='Tune';delete draft.document.main.notation;draft.document.main.score=scoreCode([{midi:60,duration:'whole'}]);assert.equal(studio.studioPayload(draft).final_notes,null);
 draft.document.final.codeDraft='broken';assert.match(studio.studioSubmissionIssue(draft),/both melodies/);assert.equal(studio.studioPayload(draft).notes[0].midi,60);
});
test('legacy melodies restore when lossless and direct complex originals to their classic editor',()=>{
 const draft=ready();delete draft.document.main.notation;draft.document.main.score=scoreCode([{midi:60,duration:'whole'}]);const payload=studio.studioPayload(draft);delete payload.studio_document;
 const restored=studio.studioFromRecord(payload);assert.equal(parseSheetCode(restored.document.main.score).staffs[0].steps[0].midi,60);
});

test('save/reload preserves flats, authored rests and automatic padding rather than respelling or shifting them',()=>{
 const score=scoreModel.importScore(scoreModel.initialScore(),{bpm:120,key:'C',staffs:[{id:'staff-1',clef:'treble',steps:[{midi:61,duration:'quarter'},{midi:null,duration:'quarter'},{midi:64,duration:'quarter'},{midi:null,duration:'quarter'}]}]},'written');
 const staff=score.staffs[0],event=staff.events[0];staff.events[0]=model.withTones(event,model.eventTones(event).map(tone=>({...tone,spelling:{letter:'D',octave:4,accidental:-1}})));staff.events[1].authored=true;staff.events[3].authored=false;
 const draft=ready();draft.document.main=studio.studioScoreDocument(score,null);const restored=studio.studioSession(studio.parseStudioDraft(JSON.parse(JSON.stringify(draft))).document.main).state.score;
 assert.equal(model.eventTones(restored.staffs[0].events[0])[0].spelling.letter,'D');assert.equal(model.eventTones(restored.staffs[0].events[0])[0].spelling.accidental,-1);assert.equal(restored.staffs[0].events[1].authored,true);assert.equal(restored.staffs[0].events[3].authored,false);
 const broken=structuredClone(draft);broken.document.main.notation[0][0].pitches[0].octave=7;assert.throws(()=>studio.parseStudioDraft(broken),/saved notation/);
});

test('Game melody submission requires Treble while preserving older non-Treble drafts',()=>{
 const draft=ready();delete draft.document.main.notation;draft.document.main.score=scoreCode([{midi:60,duration:'whole'}],{staffs:[{id:'bass-game',clef:'bass',steps:[{midi:60,duration:'whole'}]}]});
 assert.match(studio.studioSubmissionIssue(draft),/one staff in Treble/);assert.equal(studio.parseStudioDraft(draft).document.main.score,draft.document.main.score);assert.deepEqual(studio.studioPayload(draft).notes,[]);
});
