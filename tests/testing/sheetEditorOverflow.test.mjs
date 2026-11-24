import assert from 'node:assert/strict';
import test from 'node:test';
import abcjs from 'abcjs';
import {scoreModel as s, model as m, notation, parseSheetCode, codeUrl, playbackUrl} from './sheetEditorModules.mjs';
const {scoreCodeSnapshot}=await import(codeUrl), {performanceTimeline}=await import(playbackUrl);
const B=m.TICKS_PER_BEAT, bar=m.MEASURE_TICKS;
const events=state=>state.score.staffs[0].events;
const importScore=(steps,others=[])=>s.scoreReducer(s.emptyScore(),{type:'apply',seed:'overflow',value:{bpm:120,key:'C',staffs:[{id:'upper',clef:'treble',steps},...others]}});
const select=(state,index,mode='edit')=>{state=s.scoreReducer(state,{type:'mode',mode});const event=events(state).at(index);return s.scoreReducer(state,{type:'select',staffId:'upper',eventId:event.id,toneId:m.eventTones(event)[0]?.id});};
const resize=(state,duration)=>s.scoreReducer(state,{type:'part',staffId:'upper',action:{type:'duration',id:s.primary(state)?.eventId??state.rest?.eventId,duration}});

test('last-beat duration growth adds shared measures and tied display fragments without splitting logical identity',()=>{
 let state=select(importScore([{midi:null,beats:3},{midi:67,beats:1}],[{id:'bass',clef:'bass',steps:[{midi:36,beats:4}]}]),-1);
 const before=state,ref=s.primary(state),id=ref.eventId;
 state=resize(state,'half');
 assert.notEqual(state.score,before.score);
 assert.ok(state.score.staffs.every(p=>m.totalTicks(p.events)===2*bar));
 const span=m.timedEvents(events(state)).find(e=>e.event.id===id);
 assert.deepEqual([span.start,span.end],[3*B,5*B]);assert.deepEqual(state.selection,[ref]);
 assert.equal(state.past.length,before.past.length+1);
 const built=notation.scoreNotation(state.score,[]),fragments=built.fragments.filter(f=>f.staffIndex===0&&f.eventIndex===span.index);
 assert.equal(fragments.length,2);
 const notes=abcjs.parseOnly(built.abc)[0].lines.flatMap(l=>l.staff?.[0].voices.flat()??[]).filter(n=>n.pitches);
 assert.ok(notes[0].pitches[0].startTie);assert.ok(notes[1].pitches[0].endTie);
 const audio=performanceTimeline(state.score).events.filter(n=>n.midi===67);assert.equal(audio.length,1);assert.equal(audio[0].duration,1);
 assert.equal(s.scoreReducer(state,{type:'apply',value:parseSheetCode(scoreCodeSnapshot(state.score).code),seed:'roundtrip'}),state);
 assert.equal(s.scoreReducer(state,{type:'undo'}).score,before.score);
});

test('growing chords preserve later music and IDs, consuming silence before moving notes',()=>{
 let state=select(importScore([{midi:60,pitches:[60,64,67],beats:1},{midi:null,beats:1},{midi:72,beats:1},{midi:74,beats:1}]),0);
 const before=state,ids=events(state).filter(e=>m.eventTones(e).length).map(e=>e.id);
 state=resize(state,'whole');const spans=m.timedEvents(events(state)).filter(e=>m.eventTones(e.event).length);
 assert.deepEqual(spans.map(e=>e.start),[0,4*B,5*B]);assert.deepEqual(spans.map(e=>e.event.id),ids);
 assert.deepEqual(m.eventTones(spans[0].event).map(t=>m.pitchMidi(t.spelling)),[60,64,67]);
 assert.equal(s.scoreReducer(state,{type:'undo'}).score,before.score);
 let spare=select(importScore([{midi:60,beats:1},{midi:null,beats:2},{midi:72,beats:1}]),0);
 spare=resize(spare,'half');assert.equal(m.timedEvents(events(spare)).find(e=>e.event.midi===72).start,3*B);
});

test('a pushed tuplet travels as a complete group to a fitting measure',()=>{
 for(const [count,duration,end] of [[3,'whole',6],[4,'half',7]]) {
  let state=importScore([{midi:60,beats:1},{midi:null,beats:3}]);state=s.scoreReducer(state,{type:'mode',mode:'edit'});
  state=s.scoreReducer(state,{type:'select',staffId:'upper',eventId:events(state)[1].id});
  state=s.scoreReducer(state,{type:'tuplet',count,duration:'quarter',id:'travel-group'});
  const original=events(state).filter(e=>e.tuplet);assert.equal(original.length,count);
  state=select(state,0);state=resize(state,duration);
  const moved=m.timedEvents(events(state)).filter(e=>e.event.tuplet);
  assert.deepEqual(moved.map(e=>e.event.id),original.map(e=>e.id));assert.equal(moved[0].start,bar);assert.equal(moved.at(-1).end,end*B);assert.ok(m.validGroups(events(state)));
 }
});

test('Place duration edits and dot changes grow atomically while retaining the selected note',()=>{
 let state=importScore([{midi:null,beats:3},{midi:67,beats:1}]);state=select(state,-1);state={...state,mode:'place'};
 let next=resize(state,'half');assert.equal(m.totalTicks(events(next)),2*bar);assert.deepEqual(next.selection,state.selection);assert.equal(next.tick,5*B);assert.equal(next.duration,'quarter');
 next=s.scoreReducer(state,{type:'dot',value:true});assert.equal(m.eventTicks(events(next).find(e=>e.midi===67)),1.5*B);assert.equal(m.totalTicks(events(next)),2*bar);
});

test('capacity failure in any part rejects duration growth without partial edits or history',()=>{
 const long=Array.from({length:64},()=>({midi:36,beats:4}));
 let state=importScore([...Array.from({length:42},()=>({midi:60,beats:6})),{midi:67,beats:4}],[{id:'bass',clef:'bass',steps:long}]);
 state=select(state,42);const before=state;state=s.scoreReducer(state,{type:'dot',value:true});assert.equal(state.score,before.score);assert.equal(state.past,before.past);
 assert.equal(state.score.staffs[0].events.length,43);assert.equal(m.totalTicks(events(state)),64*bar);assert.match(state.message,/64/);
});

test('duration carry preserves a partial chord-to-note tie and its continuous playback',()=>{
 let state=select(importScore([{midi:60,pitches:[60,64,67],beats:1,tieToNext:[67]},{midi:67,beats:1},{midi:null,beats:2}]),0);
 state=resize(state,'half');
 const spans=m.timedEvents(events(state)),first=spans[0].event;
 assert.equal(spans[1].start,2*B);assert.equal(m.eventTones(first).find(t=>m.pitchMidi(t.spelling)===67).tieToNext,true);
 const audio=performanceTimeline(state.score).events.filter(n=>n.midi===67);assert.equal(audio.length,1);assert.equal(audio[0].duration,1.5);assert.equal(audio[0].sustain,true);
});

test('new whole note replaces a quarter rest and carries the following quarter to measure two',()=>{
 const before=importScore([{midi:null,beats:1},{midi:67,beats:1},{midi:null,beats:2}], [{id:'bass',clef:'bass',steps:[{midi:36,beats:4}]}]);
 const original=events(before).find(e=>e.midi===67), bass=before.score.staffs[1].events[0];
 const state=s.scoreReducer(before,{type:'tool',duration:'whole'});
 const next=s.scoreReducer(state,{type:'part',staffId:'upper',action:{type:'fill',id:'new-whole',tick:0,pitch:60}});
 const pitched=m.timedEvents(events(next)).filter(e=>m.eventTones(e.event).length);
 assert.deepEqual(pitched.map(e=>[e.start/B,e.end/B,e.event.midi]),[[0,4,60],[4,5,67]]);
 assert.equal(pitched[1].event,original);
 assert.ok(next.score.staffs.every(part=>m.totalTicks(part.events)===2*bar));
 assert.equal(next.score.staffs[1].events[0],bass);
 assert.equal(next.past.length,state.past.length+1);
 assert.equal(s.scoreReducer(next,{type:'undo'}).score,state.score);
 const preview=m.tentativeFill(events(state),{tick:0,pitch:60},{duration:'whole',accidental:0},'new-whole');
 const projected=s.scoreWithPartEvents(state.score,'upper',preview);
 assert.deepEqual(projected,next.score,'preview and commit share the full-score projection');
 assert.equal(s.scoreReducer(next,{type:'apply',seed:'round-trip',value:parseSheetCode(scoreCodeSnapshot(next.score).code)}),next);
});

test('new half note on beat four creates tied fragments with one sustained playback event',()=>{
 let state=s.scoreReducer(s.emptyScore(),{type:'tool',duration:'half'});
 const original=state.score;
 state=s.scoreReducer(state,{type:'part',action:{type:'fill',id:'cross-bar',tick:3*B,pitch:67}});
 const span=m.timedEvents(events(state)).find(e=>e.event.id==='cross-bar');
 assert.deepEqual([span.start,span.end],[3*B,5*B]);
 assert.equal(events(state).filter(e=>e.id==='cross-bar').length,1);
 const built=notation.scoreNotation(state.score);
 assert.equal(built.fragments.filter(f=>f.staffIndex===0&&f.eventIndex===span.index).length,2);
 const played=performanceTimeline(state.score).events.filter(e=>e.midi===67);
 assert.equal(played.length,1);assert.equal(played[0].duration,1);
 assert.equal(s.scoreReducer(state,{type:'undo'}).score,original);
});

test('placement uses silence before displacing notes and carries multiple notes without changing order',()=>{
 for(const [steps,value,expected] of [
  [[{midi:null,beats:3},{midi:67,beats:1}],'half',[[0,60],[3,67]]],
  [[{midi:null,beats:1},{midi:67,beats:1},{midi:69,beats:1},{midi:71,beats:1}],'whole',[[0,60],[4,67],[5,69],[6,71]]],
 ]) {
  let state=s.scoreReducer(importScore(steps),{type:'tool',duration:value});
  const ids=events(state).filter(e=>m.eventTones(e).length).map(e=>e.id);
  state=s.scoreReducer(state,{type:'part',action:{type:'fill',id:'inserted',tick:0,pitch:60}});
  const notes=m.timedEvents(events(state)).filter(e=>m.eventTones(e.event).length);
  assert.deepEqual(notes.map(e=>[e.start/B,e.event.midi]),expected);
  assert.deepEqual(notes.slice(1).map(e=>e.event.id),ids);
 }
});

test('endpoint caret does not grow the score; the next entry does, in one transaction',()=>{
 let state=s.emptyScore();const before=state.score;
 assert.ok(s.activeTargets(state).includes(bar));
 state=s.scoreReducer(state,{type:'caret',tick:bar,pitch:60});
 assert.equal(state.score,before);assert.equal(state.past.length,0);assert.equal(state.tick,bar);
 state=s.scoreReducer(state,{type:'part',action:{type:'fill',id:'at-end',tick:state.tick,pitch:state.pitch}});
 assert.equal(m.totalTicks(events(state)),2*bar);
 assert.equal(m.timedEvents(events(state)).find(e=>e.event.id==='at-end').start,bar);
 assert.equal(state.tick,bar+B);assert.equal(state.past.length,1);
 assert.equal(s.scoreReducer(state,{type:'undo'}).score,before);
});

test('new placement carries protected tuplets as a group but filling a slot keeps its own rhythm',()=>{
 let state=importScore([{midi:null,beats:1},{midi:null,beats:3}]);
 state=select(state,1);
 state=s.scoreReducer(state,{type:'tuplet',count:3,duration:'quarter',id:'carried-tuplet'});
 const ids=events(state).filter(e=>e.tuplet).map(e=>e.id);
 state=s.scoreReducer(state,{type:'mode',mode:'place'});
 state=s.scoreReducer(state,{type:'tool',duration:'whole'});
 state=s.scoreReducer(state,{type:'part',action:{type:'fill',id:'before-group',tick:0,pitch:60}});
 const group=m.timedEvents(events(state)).filter(e=>e.event.tuplet);
 assert.deepEqual(group.map(e=>e.event.id),ids);assert.equal(group[0].start,bar);assert.equal(group.at(-1).end,bar+2*B);
 assert.ok(m.validGroups(events(state)));
 const next=s.scoreReducer(state,{type:'part',action:{type:'fill',id:'slot-note',tick:bar,pitch:64}});
 assert.equal(events(next).find(e=>e.id==='slot-note').duration,'quarter');
 assert.equal(m.eventTicks(events(next).find(e=>e.id==='slot-note')),2*B/3);
});

test('preview and placement reject shared capacity failure without partial edits or history',()=>{
 const long=Array.from({length:64},()=>({midi:36,beats:4}));
 let state=importScore([...Array.from({length:42},()=>({midi:60,beats:6})),{midi:67,beats:4}],[{id:'bass',clef:'bass',steps:long}]);
 state=s.scoreReducer(state,{type:'tool',duration:'whole'});
 const tick=m.totalTicks(events(state)), candidate=m.tentativeFill(events(state),{tick,pitch:64},{duration:'whole',accidental:0},'over-limit');
 assert.ok(candidate,'the edited part alone can grow');
 assert.equal(s.scoreWithPartEvents(state.score,'upper',candidate),null,'another part cannot accept the padding');
 const next=s.scoreReducer(state,{type:'part',action:{type:'fill',id:'over-limit',tick,pitch:64}});
 assert.equal(next.score,state.score);assert.equal(next.past,state.past);assert.match(next.message,/64/);
});
