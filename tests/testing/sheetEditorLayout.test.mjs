import assert from 'node:assert/strict';
import test from 'node:test';
import abcjs from 'abcjs';
import {model as m,layout,notation,parseSheetCode,sheetEditorCode,victoryUrl} from './sheetEditorModules.mjs';
const {restoreVictoryNotes}=await import(victoryUrl);
const imported=steps=>m.editorReducer(m.emptyEditor(),{type:'replace-score',steps,seed:'wide'});
const codeFor=steps=>`const BPM=120;const KEY='C';const TIME_SIGNATURE='4/4';const MELODY=${JSON.stringify(steps)};`;

test('default F3–F6 pointer geometry stays anchored to E4 independently of full MIDI limits',()=>{
 const geometry={left:100,right:600,bottom:300,step:5};
 for(const midi of m.NATURAL_PITCHES){
  assert.equal(m.naturalAt(m.staffStep(midi)),midi);
  const hit=m.staffPitch({x:200,y:m.pitchY(midi,geometry)},geometry);
  assert.equal(hit,midi>=53&&midi<=89?midi:null);
 }
 assert.equal(m.pitchY(64,geometry),300);assert.equal(m.pitchY(53,geometry),330);assert.equal(m.pitchY(89,geometry),225);
 assert.ok(m.PITCH_OPTIONS.some(p=>m.pitchKey(p)==='F3'));assert.ok(m.PITCH_OPTIONS.some(p=>m.pitchKey(p)==='F6'));
 assert.equal(m.shiftPitch(53,-1),52);assert.equal(m.shiftPitch(89,1),91);assert.equal(m.shiftPitch(0,-1),0);assert.equal(m.shiftPitch(127,1),127);
});
test('wide scores format, parse and play structurally without widening production validation',()=>{
 const values=[0,30,52,53,89,102,104,127];
 const state=imported(values.map(midi=>({midi,beats:1}))),steps=m.scoreSteps(state.events);
 assert.deepEqual(steps.map(s=>s.midi),values);assert.deepEqual(parseSheetCode(sheetEditorCode(state.events)).steps.map(s=>s.midi),values);
 assert.equal(steps.reduce((n,s)=>n+s.beats,0),8);
 assert.throws(()=>restoreVictoryNotes([{midi:0,beats:1}]));assert.throws(()=>restoreVictoryNotes([{midi:127,beats:1}]));
 assert.equal(m.validMidi(NaN),false);
 const chord=imported([{midi:0,pitches:[0,30,52,53,89,102,104,127],beats:4}]);assert.equal(m.scoreSteps(chord.events)[0].pitches.length,8);
 for(const midi of [-1,128,60.5])assert.throws(()=>parseSheetCode(codeFor([{midi,beats:4}])));
});
test('per-member edits preserve identity when pitch order changes and reject explicit stale members',()=>{
 let state=imported([{midi:53,pitches:[53,60,101],beats:4}]);state=m.editorReducer(state,{type:'mode',mode:'edit'});
 const id=state.events[0].id,tone=m.eventTones(state.events[0])[1];state=m.editorReducer(state,{type:'select',id,toneId:tone.id});
 state=m.editorReducer(state,{type:'transpose',id,delta:1});assert.deepEqual(m.scoreSteps(state.events)[0].pitches,[53,61,101]);assert.equal(state.selectedToneId,tone.id);
 state=m.editorReducer(state,{type:'update',id,midi:30,duration:'whole'});assert.deepEqual(m.scoreSteps(state.events)[0].pitches,[30,53,101]);assert.equal(state.selectedToneId,tone.id);assert.equal(m.activeTone(state).id,tone.id);
 const selected=state;state=m.editorReducer(state,{type:'select',id});assert.equal(state.selectedToneId,tone.id,'coarse reselection retains member');
 assert.equal(m.editorReducer(state,{type:'select',id,toneId:'old-member'}),state);
 const stale={...selected,selectedToneId:'old-member'};assert.equal(m.activeTone(stale),null);assert.equal(m.editorReducer(stale,{type:'transpose',id,delta:1}),stale);
});
test('chromatic edits cross default F boundaries but reject absolute limits and chord collisions',()=>{
 for(const [midi,delta,expected] of [[53,-1,52],[89,1,90],[0,-1,0],[127,1,127]]){
  let state=imported([{midi,beats:4}]);state=m.editorReducer(state,{type:'mode',mode:'edit'});const id=state.events[0].id;state=m.editorReducer(state,{type:'select',id});
  const before=state;state=m.editorReducer(state,{type:'transpose',id,delta});assert.equal(state.events[0].midi,expected);
  if(midi===expected){assert.equal(state.events,before.events);assert.equal(state.past,before.past);assert.match(state.message,/0–127/);}
 }
 let state=imported([{midi:60,pitches:[60,61],beats:4}]);state=m.editorReducer(state,{type:'mode',mode:'edit'});const id=state.events[0].id;state=m.editorReducer(state,{type:'select',id});
 const before=state,next=m.editorReducer(state,{type:'transpose',id,delta:1});assert.equal(next.events,before.events);assert.equal(next.selectedToneId,before.selectedToneId);
});
test('row packing keeps fitting measures intact, fills wider rows and splits dense measures without data edits',()=>{
 const events=imported(Array.from({length:16},()=>({midi:null,beats:1}))).events,widths=events.map(()=>40),before=JSON.stringify(events);
 assert.deepEqual(layout.rowStarts(events,widths,320),[0,8]);assert.deepEqual(layout.rowStarts(events,widths,160),[0,4,8,12]);
 const dense=imported(Array.from({length:64},()=>({midi:60,beats:.25}))).events;
 const starts=layout.rowStarts(dense,dense.map(()=>36),180);assert.equal(starts[0],0);assert.ok(starts.length>=16);
 assert.equal(new Set(starts).size,starts.length);assert.equal(JSON.stringify(events),before);
 assert.equal(layout.rowStarts(dense,dense.map(()=>500),100).length,64,'an indivisible event still advances the partition');
});
test('visual continuations preserve bar timing and repeat needed accidentals without adding musical events',()=>{
 const state=imported(Array.from({length:16},(_,i)=>({midi:i<8?54:89,beats:.25}))),breaks=[4,8,12];
 const built=notation.sheetNotation(state.events,1,breaks),tune=abcjs.parseOnly(built.abc)[0];
 assert.equal(tune.lines.filter(l=>l.staff).length,4);assert.deepEqual(built.fragmentRows,[...Array(4).fill(0),...Array(4).fill(1),...Array(4).fill(2),...Array(4).fill(3)]);
 const notes=tune.lines.flatMap(l=>l.staff?.[0].voices.flat()??[]).filter(n=>n.el_type==='note'&&n.duration>0);
 assert.equal(notes.length,16);assert.equal(notes.reduce((n,s)=>n+s.duration,0),1);
 assert.ok(built.abc.split('\n').filter(line=>line.includes('^F,')).length>=2,'F-sharp is explicit on a mid-measure continuation');
 assert.equal(tune.lines.flatMap(l=>l.staff?.[0].voices.flat()??[]).filter(n=>n.el_type==='bar').length,1);
 for(let i=0;i<16;i+=4){assert.ok(notes[i].startBeam);assert.ok(notes[i+3].endBeam);}
});
