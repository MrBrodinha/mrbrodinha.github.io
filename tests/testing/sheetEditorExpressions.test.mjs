import assert from 'node:assert/strict';
import test from 'node:test';
import abcjs from 'abcjs';
import {model as m,scoreModel as s,expressions as x,playback as p,notation as n,layout,rhythm,parseSheetCode,codeUrl} from './sheetEditorModules.mjs';
const {scoreCodeSnapshot}=await import(codeUrl),B=m.TICKS_PER_BEAT,bar=m.MEASURE_TICKS;
const apply=(steps,bpm=120)=>s.scoreReducer(s.emptyScore(),{type:'apply',value:{bpm,key:'C',staffs:[{id:'staff-1',clef:'treble',steps}]},seed:'fixture'});
const fill=(state,tick=0,pitch=60,id='note')=>s.scoreReducer(state,{type:'part',action:{type:'fill',tick,pitch,id}});
const pick=(state,id,toneId,toggle=false)=>s.scoreReducer(state,{type:'select',staffId:'staff-1',eventId:id,toneId,toggle});
const events=state=>state.score.staffs[0].events;
const edit=state=>s.scoreReducer(state,{type:'mode',mode:'edit'});

test('all allowed written values, dots and tuplet ratios occupy exact safe integer ticks',()=>{
 for(const duration of m.NOTE_VALUES)for(const dotted of [false,true])assert.ok(Number.isSafeInteger(m.eventTicks({duration,dotted})));
 for(const duration of m.NOTE_VALUES)for(const [count,inTimeOf] of Object.entries(rhythm.TUPLET_RATIOS))assert.ok(Number.isSafeInteger(m.eventTicks({duration,tuplet:{id:'g',count:Number(count),inTimeOf,index:1}})));
 assert.equal(m.eventTicks({duration:'sixteenth',dotted:true}),B*.375);assert.equal(m.eventTicks({duration:'sixteenth',tuplet:{id:'g',count:7,inTimeOf:4,index:1}})*7,B);
 assert.equal(m.rhythmTargets(m.initialEvents(),'sixteenth').length,17);
});

test('dots resize notes/rests atomically with exact short padding and undo',()=>{
 let state=fill(s.emptyScore(),0,60),before=state.score;
 state=s.scoreReducer(state,{type:'dot',value:true});assert.equal(events(state)[0].dotted,true);assert.equal(m.eventTicks(events(state)[0]),B*1.5);assert.equal(state.tick,B*1.5);assert.equal(m.totalTicks(events(state)),bar);
 assert.equal(s.scoreReducer(state,{type:'undo'}).score,before);
 let short=s.scoreReducer(s.emptyScore(),{type:'tool',duration:'sixteenth'});short=fill(short);short=s.scoreReducer(short,{type:'dot',value:true});assert.equal(events(short)[1].duration,'thirty-second');
 let rest=edit(s.emptyScore());rest=pick(rest,events(rest)[0].id);rest=s.scoreReducer(rest,{type:'dot',value:true});assert.equal(events(rest)[0].midi,null);assert.equal(events(rest)[0].dotted,true);
 let collision=fill(s.emptyScore(),B,64,'later');collision=fill(collision,0,60,'first');before=collision.score;const carried=s.scoreReducer(collision,{type:'dot',value:true});assert.notEqual(carried.score,before);assert.equal(m.timedEvents(events(carried)).find(e=>e.event.id==='later').start,1.5*B);assert.equal(s.scoreReducer(carried,{type:'undo'}).score,before);
});

test('dotted whole adds capacity and produces exact cross-bar fragments',()=>{
 let state=s.scoreReducer(s.emptyScore(),{type:'tool',duration:'whole'});state=s.scoreReducer(state,{type:'entry-dot',value:true});state=fill(state);assert.equal(m.eventTicks(events(state)[0]),6*B);assert.equal(m.totalTicks(events(state)),8*B);
 const abc=n.scoreNotation(state.score),notes=abcjs.parseOnly(abc.abc)[0].lines.flatMap(l=>l.staff?.[0].voices.flat()??[]).filter(e=>e.el_type==='note'&&e.pitches);
 assert.deepEqual(notes.map(e=>e.duration),[1,.5]);assert.ok(notes[0].pitches[0].startTie);assert.ok(notes[1].pitches[0].endTie);
});

test('tuplet presets protect exact empty slots and preserve later notes through filling/deleting',()=>{
 for(const [countText,inTimeOf] of Object.entries(rhythm.TUPLET_RATIOS)){
  const count=Number(countText);let state=fill(s.emptyScore(),3*B,72,'later');state=edit(state);state=pick(state,events(state)[0].id);
  state=s.scoreReducer(state,{type:'tuplet',count,duration:count===3?'eighth':'sixteenth',id:'g'});
  const group=events(state).filter(e=>e.tuplet);assert.equal(group.length,count);assert.equal(m.timedEvents(events(state)).find(s=>s.event.id==='later').start,3*B);assert.equal(group[0].tuplet.inTimeOf,inTimeOf);
  const groupStart=m.timedEvents(events(state)).find(s=>s.event.tuplet)?.start??0;state=s.scoreReducer(state,{type:'mode',mode:'place'});state=s.scoreReducer(state,{type:'tool',duration:'whole'});state=fill(state,groupStart,60,'member');assert.equal(events(state).find(e=>e.id==='member').duration,count===3?'eighth':'sixteenth');assert.equal(events(state).filter(e=>e.tuplet).length,count);
  state=edit(state);state=pick(state,'member');state=s.scoreReducer(state,{type:'delete-selection'});assert.equal(events(state).filter(e=>e.tuplet).length,count);assert.ok(events(state).filter(e=>e.tuplet).every(e=>e.midi===null));
  state=pick(state,events(state).find(e=>e.tuplet).id);state=s.scoreReducer(state,{type:'remove-tuplet'});assert.equal(events(state).filter(e=>e.tuplet).length,0);assert.equal(m.totalTicks(events(state)),bar);
 }
});

test('quadruplet span, populated-group protection and exact source round trips',()=>{
 let state=edit(s.emptyScore());state=pick(state,events(state)[0].id);state=s.scoreReducer(state,{type:'tuplet',count:4,duration:'sixteenth',id:'q'});
 assert.equal(m.timedEvents(events(state))[3].end,B*.75);assert.equal(events(state)[4].midi,null);
 const code=scoreCodeSnapshot(state.score).code,parsed=parseSheetCode(code);assert.equal(parsed.staffs[0].steps[0].tuplet.count,4);assert.equal(s.scoreReducer(state,{type:'apply',value:parsed,seed:'same'}),state);
 state=s.scoreReducer(state,{type:'mode',mode:'place'});state=fill(state,0,60,'qnote');state=edit(state);const rest=events(state).find(e=>e.tuplet&&e.midi===null);state=pick(state,rest.id);assert.equal(s.scoreReducer(state,{type:'remove-tuplet'}).score,state.score);
 assert.throws(()=>parseSheetCode(code.replace('"index":2','"index":1')));assert.throws(()=>parseSheetCode(code.replace('"count":4','"count":"4"')));
});

test('partial same-pitch chord ties sustain one voice, retain untied attacks and clean up changed endpoints',()=>{
 let state=apply([{midi:60,pitches:[60,64,67],beats:1},{midi:60,pitches:[60,65,67],beats:1},{midi:null,beats:2}]);state=edit(state);const first=events(state)[0],tone=m.eventTones(first)[0];state=pick(state,first.id,tone.id);state=s.scoreReducer(state,{type:'tie'});
 const timeline=p.performanceTimeline(state.score);assert.equal(timeline.events.filter(e=>e.midi===60).length,1);const c=timeline.events.find(e=>e.midi===60);assert.equal(c.duration,1);assert.equal(c.sustain,true);assert.equal(timeline.events.filter(e=>e.time===.5).length,2);
 const abc=n.scoreNotation(state.score).abc;const parsed=abcjs.parseOnly(abc)[0].lines.flatMap(l=>l.staff?.[0].voices.flat()??[]).filter(e=>e.pitches);assert.ok(parsed[0].pitches[0].startTie);assert.ok(!parsed[0].pitches[1].startTie);
 const tied=state.score;state=s.scoreReducer(state,{type:'transpose',delta:1});assert.equal(m.eventTones(events(state)[0])[0].tieToNext,undefined);assert.match(state.message,/ties removed/);assert.equal(s.scoreReducer(state,{type:'undo'}).score,tied);
});

test('arpeggios roll both directions with common releases and do not reattack incoming ties',()=>{
 let state=apply([{midi:60,pitches:[60,64,67],beats:1},{midi:60,pitches:[60,65,69],beats:1},{midi:null,beats:2}]);state=edit(state);state=pick(state,events(state)[0].id);state=s.scoreReducer(state,{type:'tie'});state=s.scoreReducer(state,{type:'arpeggio',value:'down'});
 const first=p.performanceTimeline(state.score).events.filter(e=>e.time<.5);assert.deepEqual(first.map(e=>e.midi),[67,64,60]);assert.ok(first.at(-1).time<=.12);assert.equal(first.find(e=>e.midi===60).time+first.find(e=>e.midi===60).duration,1);
 state=pick(state,events(state)[1].id);state=s.scoreReducer(state,{type:'arpeggio',value:'up'});const timeline=p.performanceTimeline(state.score);assert.equal(timeline.events.filter(e=>e.midi===60).length,1);assert.deepEqual(timeline.events.filter(e=>e.time>=.5).map(e=>e.midi),[65,69]);
 assert.match(n.scoreNotation(state.score).abc,/!arpeggio!/);assert.match(n.scoreNotation(state.score).abc,/↓/);
});

test('quintuplets/septuplets preserve exact ends without production-grid rounding',()=>{
 for(const count of [5,7]){
  let state=edit(s.emptyScore());state=pick(state,events(state)[0].id);state=s.scoreReducer(state,{type:'tuplet',count,duration:'sixteenth',id:'g'});state=s.scoreReducer(state,{type:'mode',mode:'place'});
  for(let i=0;i<count;i++)state=fill(state,i*B/count,[60,62,64,65,67,69,71][i],'n'+i);
  const timeline=p.performanceTimeline(state.score);assert.equal(timeline.totalDuration,2);const tones=timeline.events;assert.equal(tones.length,count);assert.equal(tones.at(-1).time+tones.at(-1).duration,.5);
  const cuts=layout.scoreRowCuts(state.score,{},70);assert.ok(cuts.every(t=>n.legalCut(state.score,t)));assert.equal(n.scoreNotation(state.score,cuts).fragments.filter(f=>f.start<B).length,count);
 }
});

test('expressive code rejects invalid ties/marks/nesting and no-op Apply preserves all metadata',()=>{
 let state=apply([{midi:60,pitches:[60,64],duration:'quarter',dotted:true,arpeggio:'down'},{midi:null,beats:2},{midi:null,beats:.5}]);const code=scoreCodeSnapshot(state.score).code;assert.equal(s.scoreReducer(state,{type:'apply',value:parseSheetCode(code),seed:'same'}),state);
 assert.throws(()=>parseSheetCode(code.replace('"arpeggio":"down"','"tieToNext":[60]')));assert.throws(()=>parseSheetCode(code.replace('"dotted":true','"dotted":3')));assert.throws(()=>parseSheetCode(code+'\nalert(1)'));
 assert.equal(x.dottedEvents(events(state),events(state)[0].id,true),events(state));
});

test('many mixed-part quintuplets and septuplets share exact ends at low and high tempos',()=>{
 const steps=count=>Array.from({length:8},(_,group)=>Array.from({length:count},(_,i)=>({midi:(count===7?36:60)+i,duration:'sixteenth',tuplet:{id:`g${group}`,count,inTimeOf:4,index:i+1}}))).flat();
 for(const bpm of [20,60,120,400]){
  const state=s.scoreReducer(s.emptyScore(),{type:'apply',seed:'many',value:{bpm,key:'C',staffs:[{id:'upper',clef:'treble',steps:steps(5)},{id:'lower',clef:'bass',steps:steps(7)}]}});
  assert.equal(state.score.staffs.length,2);assert.ok(state.score.staffs.every(part=>m.totalTicks(part.events)===8*B));
  const timeline=p.performanceTimeline(state.score);assert.equal(timeline.events.length,96);assert.equal(timeline.totalDuration,8*60/bpm);
  for(const part of state.score.staffs)for(const span of m.timedEvents(part.events)){
   const note=timeline.events.find(e=>e.midi===span.event.midi&&Math.abs(e.time-span.start/B*60/bpm)<1e-10);assert.ok(note);assert.ok(Math.abs(note.time+note.duration-span.end/B*60/bpm)<1e-10);
  }
  assert.equal(s.scoreReducer(state,{type:'apply',value:parseSheetCode(scoreCodeSnapshot(state.score).code),seed:'again'}),state);
 }
});

test('authored tie chains survive bar/system display splits and joint endpoint edits',()=>{
 let state=apply([{midi:null,duration:'half',dotted:true},{midi:60,duration:'quarter',tieToNext:[60]},{midi:60,duration:'quarter',tieToNext:[60]},{midi:60,duration:'quarter'},{midi:null,duration:'half'}]);
 const parts=n.scoreNotation(state.score,[4*B,5*B]),notes=abcjs.parseOnly(parts.abc)[0].lines.flatMap(l=>l.staff?.[0].voices.flat()??[]).filter(e=>e.pitches);
 assert.equal(notes.length,3);assert.ok(notes[0].pitches[0].startTie);assert.ok(notes[1].pitches[0].startTie);assert.ok(notes[1].pitches[0].endTie);assert.ok(notes[2].pitches[0].endTie);
 let timeline=p.performanceTimeline(state.score);assert.equal(timeline.events.length,1);assert.equal(timeline.events[0].time,1.5);assert.equal(timeline.events[0].duration,1.5);
 state=edit(state);const chosen=events(state).filter(e=>e.midi!==null);for(const [i,e] of chosen.entries())state=pick(state,e.id,undefined,i>0);
 state=s.scoreReducer(state,{type:'transpose',delta:1});assert.ok(events(state).filter(e=>e.midi!==null).every(e=>e.midi===61));assert.equal(p.performanceTimeline(state.score).events.length,1);
});

test('all-rest reconfiguration, collision rejection and arpeggio cleanup preserve atomic history',()=>{
 let state=edit(s.emptyScore());state=pick(state,events(state)[0].id);state=s.scoreReducer(state,{type:'tuplet',count:5,duration:'sixteenth',id:'first'});const quint=state.score;
 state=pick(state,events(state)[0].id);state=s.scoreReducer(state,{type:'tuplet',count:7,duration:'sixteenth',id:'second'});assert.equal(events(state).filter(e=>e.tuplet).length,7);assert.equal(s.scoreReducer(state,{type:'undo'}).score,quint);
 const collision=apply([{midi:null,beats:1},{midi:67,beats:1},{midi:null,beats:2}]);assert.equal(x.tupletEvents(events(collision),events(collision)[0].id,3,'quarter','bad'),null);
 state=edit(apply([{midi:60,pitches:[60,64],duration:'quarter',arpeggio:'down'},{midi:null,duration:'half',dotted:true}]));state=pick(state,events(state)[0].id);const before=state.score;state=s.scoreReducer(state,{type:'delete-selection'});assert.equal(events(state)[0].arpeggio,undefined);assert.match(state.message,/arpeggio/i);assert.equal(s.scoreReducer(state,{type:'undo'}).score,before);
});

test('eight-tone rolls remain inside short tuplet slots at slow and fast tempos',()=>{
 for(const bpm of [20,120,400])for(const count of [5,7])for(const direction of ['up','down']){
  const pitches=[53,60,61,62,63,64,65,89],steps=Array.from({length:count},(_,i)=>({midi:i?null:53,...(i?{}:{pitches,arpeggio:direction}),duration:'sixteenth',tuplet:{id:'g',count,inTimeOf:4,index:i+1}}));
  const state=apply([...steps,{midi:null,duration:'half',dotted:true}],bpm),timeline=p.performanceTimeline(state.score),duration=60/bpm/count;
  assert.equal(timeline.events.length,8);assert.deepEqual(timeline.events.map(e=>e.midi),direction==='up'?pitches:[...pitches].reverse());
  assert.ok(Math.abs(timeline.events.at(-1).time-Math.min(.12,duration/3))<1e-10);assert.ok(timeline.events.every(e=>e.duration>0&&Math.abs(e.time+e.duration-duration)<1e-10));
  const audition=p.auditionTimeline(pitches,bpm,1/count,direction);assert.deepEqual(audition.events.map(e=>e.midi),timeline.events.map(e=>e.midi));assert.ok(audition.totalDuration<=.5);
 }
});

test('Staccato edits preserve written time, Undo, chord articulation and canonical code round trips',()=>{
 let state=edit(apply([{midi:60,pitches:[60,64],duration:'quarter'},{midi:67,duration:'quarter'},{midi:null,duration:'half'}]));state=pick(state,events(state)[0].id);
 const original=state.score,ticks=m.totalTicks(events(state));state=s.scoreReducer(state,{type:'staccato',value:true});
 assert.equal(events(state)[0].staccato,true);assert.equal(m.totalTicks(events(state)),ticks);assert.equal(m.timedEvents(events(state))[1].start,B);assert.equal(s.scoreReducer(state,{type:'undo'}).score,original);
 assert.equal(s.scoreReducer(state,{type:'staccato',value:true}),state);
 const code=scoreCodeSnapshot(state.score).code;assert.match(code,/"staccato":true/);assert.equal(parseSheetCode(code).staffs[0].steps[0].staccato,true);
 assert.equal(s.scoreReducer(state,{type:'apply',value:parseSheetCode(code),seed:'noop'}),state);
 const changed=s.scoreReducer(state,{type:'apply',value:parseSheetCode(code.replace('"staccato":true','"staccato":false')),seed:'remove'});assert.notEqual(changed.score,state.score);assert.equal(Boolean(events(changed)[0].staccato),false);
 state=s.scoreReducer(state,{type:'entry-kind',value:'rest'});assert.equal(events(state)[0].staccato,undefined);
 assert.equal(s.scoreReducer(state,{type:'staccato',value:true}),state);
});

test('Staccato sounds shorter without moving later attacks, arpeggios, rests or the score endpoint; ties retain sustain',()=>{
 const steps=[{midi:60,duration:'quarter',staccato:true},{midi:62,pitches:[62,65],duration:'quarter',staccato:true,arpeggio:'down'},{midi:null,duration:'half'}];
 const marked=p.performanceTimeline(apply(steps).score),plain=p.performanceTimeline(apply(steps.map(({staccato,...step})=>step)).score);
 assert.equal(marked.totalDuration,2);assert.equal(marked.totalDuration,plain.totalDuration);
 for(const note of marked.events){const ordinary=plain.events.find(event=>event.midi===note.midi);assert.equal(note.time,ordinary.time);assert.equal(note.duration,ordinary.duration/2);assert.equal(note.sustain,true);}
 const tied=apply([{midi:60,duration:'quarter',staccato:true,tieToNext:[60]},{midi:60,duration:'quarter'},{midi:null,duration:'half'}]);
 assert.equal(p.performanceTimeline(tied.score).events.length,1);assert.equal(p.performanceTimeline(tied.score).events[0].duration,1);
 const preview=p.auditionTimeline([60,64],120,1,'up',undefined,true);assert.equal(preview.totalDuration,.5);assert.equal(preview.events[0].duration,.25);assert.equal(preview.events[1].time,.12);
});

test('Staccato notation appears only on the attack fragment and is parsed as an articulation by abcjs',()=>{
 const state=apply([{midi:60,duration:'whole',dotted:true,staccato:true},{midi:null,duration:'half'}]);
 const output=n.scoreNotation(state.score);assert.equal((output.abc.match(/\.C/g)??[]).length,1);
 const tune=abcjs.parseOnly(output.abc)[0];assert.equal(tune.warnings,undefined);
 const notes=tune.lines.flatMap(line=>line.staff??[]).flatMap(staff=>staff.voices.flat()).filter(note=>note.el_type==='note'&&note.pitches);
 assert.ok(notes[0].decoration.includes('staccato'));assert.equal(notes[1].decoration?.includes('staccato')??false,false);assert.equal(m.totalTicks(events(state)),8*B);
});

test('Staccato entry fills protected tuplet slots, skips rests and survives pitch/duration changes',()=>{
 let state=s.scoreReducer(s.emptyScore(),{type:'entry-staccato',value:true});state=edit(state);state=pick(state,events(state)[0].id);state=s.scoreReducer(state,{type:'tuplet',count:3,duration:'eighth',id:'staccato-triplet'});
 state=s.scoreReducer(state,{type:'mode',mode:'place'});state=fill(state);assert.equal(events(state)[0].staccato,true);assert.equal(events(state)[0].tuplet.count,3);assert.equal(m.totalTicks(events(state)),bar);
 const restEntry=m.tentativeFill(m.initialEvents(),{tick:0,pitch:60},{duration:'quarter',accidental:0,entryKind:'rest',staccato:true},'rest');assert.ok(restEntry.every(event=>!event.staccato));
 state=pick(edit(state),events(state)[0].id);state=s.scoreReducer(state,{type:'transpose',delta:1});assert.equal(events(state)[0].staccato,true);
});

test('code rejects non-boolean staccato and staccato on rests without changing the score',()=>{
 const state=apply([{midi:60,duration:'whole',staccato:true}]),code=scoreCodeSnapshot(state.score).code;
 for(const value of ['1','"true"','null'])assert.throws(()=>parseSheetCode(code.replace('"staccato":true','"staccato":'+value)),/Staccato/);
 assert.throws(()=>parseSheetCode(code.replace('"midi":60','"midi":null')),/Staccato/);
 assert.ok(parseSheetCode(code.replace(',"staccato":true','')).staffs[0].steps.every(event=>!event.staccato));
});
