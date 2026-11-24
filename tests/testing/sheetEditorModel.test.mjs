import assert from 'node:assert/strict';
import test from 'node:test';
import { model as m, victoryUrl } from './sheetEditorModules.mjs';
const { arrangementTimeline } = await import(victoryUrl);
const {emptyEditor,eventTones}=m;
// Existing tables use sixteenth-note units; the implementation uses exact ticks.
const scale=m.TICKS_PER_BEAT/4;
const r=(state,action)=>m.editorReducer(state,'tick' in action?{...action,tick:action.tick*scale}:action);
const timedEvents=events=>m.timedEvents(events).map(s=>({...s,start:s.start/scale,end:s.end/scale}));
const targets=(events,value)=>m.rhythmTargets(events,value).map(t=>t/scale);
const totalTicks=events=>m.totalTicks(events)/scale;
const NOTE_TICKS=Object.fromEntries(Object.entries(m.NOTE_TICKS).map(([k,v])=>[k,v/scale]));
const tentativeFill=(events,caret,...args)=>m.tentativeFill(events,{...caret,tick:caret.tick*scale},...args);
const fill=(s,tick,pitch=60,duration='quarter',id=`n${tick}`)=>r(r(s,{type:'tool',duration}),{type:'fill',tick,pitch,id});
const select=(s,id)=>r(r(s,{type:'mode',mode:'edit'}),{type:'select',id});
function valid(s){
 assert.ok(totalTicks(s.events)>=16);assert.equal(totalTicks(s.events)%16,0);assert.ok(s.events.length<=64);
 assert.equal(new Set(s.events.map(e=>e.id)).size,s.events.length);
 for(const span of timedEvents(s.events)){assert.ok(span.end>span.start);}
}
test('initial score has four quarter rests, complete time, default Place/Quarter and no history',()=>{
 const s=emptyEditor();assert.deepEqual(s.events.map(e=>[e.midi,e.duration]),Array(4).fill([null,'quarter']));
 assert.equal(totalTicks(s.events),16);assert.equal(s.past.length,0);assert.equal(s.mode,'place');assert.equal(s.duration,'quarter');assert.ok(m.isInitialScore(s.events));valid(s);
});
test('sixteenth fills decompose residual silence correctly at every within-beat offset',()=>{
 const expected=[[[0,60,1],[1,null,1],[2,null,2]],[[0,null,1],[1,60,1],[2,null,2]],[[0,null,2],[2,60,1],[3,null,1]],[[0,null,2],[2,null,1],[3,60,1]]];
 for(let tick=0;tick<4;tick++){
  const initial=emptyEditor(),s=fill(initial,tick,60,'sixteenth');valid(s);
  assert.deepEqual(timedEvents(s.events).filter(p=>p.start<4).map(p=>[p.start,p.event.midi,p.end-p.start]),expected[tick]);
  assert.deepEqual(s.events.slice(-3),initial.events.slice(-3));assert.equal(s.past[0],initial.events);
 }
});
test('every duration/onset either fills exact time or rejects atomically; half/whole consume adjacent rests',()=>{
 for(const duration of m.NOTE_VALUES)for(let tick=0;tick<16;tick++){
  const s=emptyEditor(),after=fill(s,tick,64,duration);valid(after);
  assert.equal(timedEvents(after.events).find(p=>p.event.midi===64).start,tick);assert.equal(after.past.length,1);
  assert.equal(totalTicks(after.events),Math.max(16,Math.ceil((tick+NOTE_TICKS[duration])/16)*16));
 }
 assert.deepEqual(fill(emptyEditor(),0,60,'half').events.map(e=>e.duration),['half','quarter','quarter']);
 assert.equal(fill(emptyEditor(),0,60,'whole').events.length,1);
});
test('occupied spans, invalid pitches/positions and duplicate IDs never partially modify the score',()=>{
 const s=fill(emptyEditor(),4,67);
 for(const [tick,pitch,duration,id] of [[5,60,'sixteenth','bad'],[-1,60,'quarter','bad'],[0,-1,'quarter','bad'],[0,61,'quarter','bad'],[0,128,'quarter','bad'],[0,60,'quarter','n4']]){
  const after=fill(s,tick,pitch,duration,id);assert.equal(after.events,s.events);assert.equal(after.past,s.past);
 }
});
test('candidate fill is pure and commits the same rhythm and pitches with real IDs',()=>{
 const s=emptyEditor(),tool={duration:'sixteenth',accidental:-1},caret={tick:2,pitch:62};
 const preview=tentativeFill(s.events,caret,tool),after=r({...s,...tool},{type:'fill',...caret,id:'real'});
 const shape=events=>timedEvents(events).map(p=>[p.start,p.end,p.event.midi,p.event.spelling]);
 assert.deepEqual(shape(preview),shape(after.events));assert.equal(s.events.length,4);assert.equal(s.past.length,0);assert.equal(after.events.find(e=>e.id==='real').midi,61);
});
test('deletion and duration shrink/growth preserve later onsets and restore exact snapshots on undo',()=>{
 let s=fill(fill(emptyEditor(),0,60,'half'),12,67),original=s.events;
 s=select(s,'n0');s=r(s,{type:'duration',id:'n0',duration:'quarter'});valid(s);
 assert.equal(timedEvents(s.events).find(p=>p.event.id==='n12').start,12);
 s=r(s,{type:'duration',id:'n0',duration:'whole'});assert.equal(s.past.length,3);assert.match(s.message,/not changed/);
 s=r(s,{type:'undo'});assert.equal(s.events,original);
 s=select(s,'n0');s=r(s,{type:'delete',id:'n0'});valid(s);assert.equal(timedEvents(s.events).find(p=>p.event.id==='n12').start,12);
 assert.deepEqual(s.events.slice(0,3).map(e=>e.duration),['quarter','quarter','quarter']);
 s=r(s,{type:'undo'});assert.equal(s.events,original);
});
test('rest conversion, silent deletion feedback and derived rest durations preserve time',()=>{
 let s=select(emptyEditor(),`initial:rest:${4*scale}`);const original=s.events;
 assert.equal(r(s,{type:'duration',id:s.selectedId,duration:'whole'}),s);
 const noop=r(s,{type:'delete',id:s.selectedId});assert.equal(noop.events,original);assert.equal(noop.past,s.past);
 s=r(s,{type:'update',id:s.selectedId,midi:62,duration:'quarter'});assert.equal(totalTicks(s.events),16);
 s=r(s,{type:'update',id:s.selectedId,midi:null,duration:'quarter'});assert.ok(m.isInitialScore(s.events));
});
test('Add measure and reset are atomic, complete and undoable without changing mode or entry tools',()=>{
 let s=fill(emptyEditor(),2,64,'sixteenth');s=r(s,{type:'add-measure'});assert.equal(totalTicks(s.events),32);assert.equal(s.tick/scale,16);
 const before=s.events;s=select(s,'n2');s=r(s,{type:'clear'});assert.ok(m.isInitialScore(s.events));assert.equal(s.mode,'edit');assert.equal(s.duration,'sixteenth');
 s=r(s,{type:'undo'});assert.equal(s.events,before);assert.equal(totalTicks(s.events),32);assert.equal(s.selectedId,null);
 assert.equal(r(emptyEditor(),{type:'clear'}).past.length,0);
});
test('event cap is checked after rest regeneration; a full score may still fill or add chord tones',()=>{
 let s=emptyEditor();for(let i=1;i<16;i++)s=r(s,{type:'add-measure'});assert.equal(s.events.length,64);
 const full=s.events;s=r(s,{type:'add-measure'});assert.equal(s.events,full);
 const split=fill(s,0,60,'sixteenth');assert.equal(split.events,full,'split would exceed 64');
 s=fill(s,0,60);assert.equal(s.events.length,64);s=r(s,{type:'add-tone',id:'n0',pitch:64,toneId:'e'});assert.equal(eventTones(s.events[0]).length,2);
});
test('rhythmic cursor includes untouched offbeats and finer existing onsets; one exact append target',()=>{
 assert.deepEqual(targets(emptyEditor().events,'quarter'),[0,4,8,12,16]);
 assert.deepEqual(targets(emptyEditor().events,'eighth'),[0,2,4,6,8,10,12,14,16]);
 assert.deepEqual(targets(emptyEditor().events,'sixteenth'),Array.from({length:17},(_,i)=>i));
 assert.ok(targets(fill(emptyEditor(),1,60,'sixteenth').events,'quarter').includes(2));
});
test('explicit modes and score revisions reject stale callbacks even after mode/undo round trips',()=>{
 let s=emptyEditor(),original=s.events;s=r(s,{type:'select',id:original[0].id});assert.equal(s.selectedId,null);
 s=r(s,{type:'mode',mode:'edit'});assert.equal(s.events,original);assert.equal(s.past.length,0);
 for(const action of [{type:'fill',id:'bad',tick:0,pitch:60},{type:'add-tone',id:original[0].id,pitch:64,toneId:'e'},{type:'tool',duration:'whole'}])assert.equal(r(s,action),s);
 s=r(s,{type:'mode',mode:'place'});assert.equal(r(s,{type:'fill',id:'bad',tick:0,pitch:60,modeVersion:0}),s);
 s=fill(s,0);const revision=s.revision;s=r(s,{type:'undo'});
 assert.equal(r(s,{type:'fill',id:'stale',tick:0,pitch:60,revision}),s);
 const placed=fill(s,0);assert.equal(r(placed,{type:'delete',id:'n0'}),placed);
});
test('actual timeline includes all silence, exact offbeat time and simultaneous chords',()=>{
 let s=fill(emptyEditor(),2,60,'sixteenth');s=r(s,{type:'add-tone',id:'n2',pitch:64,toneId:'e'});
 const timeline=arrangementTimeline([m.scoreSteps(s.events)],120);
 assert.equal(timeline.totalDuration,2);assert.deepEqual(timeline.events,[{time:.25,duration:.125,pitches:[60,64]}]);
});
test('measured staff pitch and inverse transforms retain bounds and tap intent',()=>{
 const lines=[100,110,120,130,140].map(y=>({left:20,right:600,top:y-.2,bottom:y+.2}));const g=m.staffGeometry(lines,80,[],0);
 for(const [y,pitch] of [[140,64],[135,65],[130,67],[150,60],[80,84]])assert.equal(m.staffPitch({x:200,y},g),pitch);
 assert.equal(m.staffPitch({x:30,y:140},g),null);assert.equal(m.staffPitch({x:200,y:0},g),null);assert.equal(m.staffGeometry(lines.slice(1),80,[],0),null);
 assert.deepEqual(m.svgPoint({x:350,y:380},{a:.5,b:0,c:0,d:.5,e:25,f:-50}),{x:200,y:140});
 assert.ok(m.isTap({x:1,y:1,scroll:0},{x:3,y:2,scroll:0}));assert.ok(!m.isTap({x:1,y:1,scroll:0},{x:3,y:2,scroll:20}));
});
test('finishing a bar and changing tool granularity always leave the cursor on an offered target',()=>{
 let s=emptyEditor();s=r(s,{type:'tool',duration:'sixteenth'});s=r(s,{type:'caret',tick:15,pitch:64});assert.equal(s.tick/scale,15);
 s=r(s,{type:'tool',duration:'quarter'});assert.equal(s.tick/scale,16);
 s=fill(s,12,64,'quarter');assert.equal(s.tick/scale,16);assert.ok(targets(s.events,s.duration).includes(s.tick/scale));
 s=r(s,{type:'undo'});assert.ok(targets(s.events,s.duration).includes(s.tick/scale));
});
test('code replacement is atomic, time-complete and one undo step in either mode',()=>{
 let state=r(m.emptyEditor(),{type:'fill',tick:4,pitch:64,id:'e'});
 state=r(state,{type:'mode',mode:'edit'});state=r(state,{type:'select',id:'e'});
 const previous=state;
 state=r(state,{type:'replace-score',seed:'apply',revision:state.revision,steps:[{midi:60,pitches:[60,64,67],beats:2},{midi:null,beats:2},{midi:72,beats:4}]});
 assert.equal(state.revision,previous.revision+1);assert.equal(state.past.length,previous.past.length+1);assert.equal(state.past.at(-1),previous.events);
 assert.equal(state.mode,'edit');assert.equal(state.selectedId,null);assert.equal(totalTicks(state.events),32);
 assert.deepEqual(m.scoreSteps(state.events)[0].pitches,[60,64,67]);assert.equal(timedEvents(state.events).at(-1).start,16);
 state=r(state,{type:'undo'});assert.equal(state.events,previous.events);assert.equal(totalTicks(state.events),16);
});
test('identical imported music preserves D-flat spelling, event/member identities and history',()=>{
 let state=r(m.emptyEditor(),{type:'entry-accidental',value:-1});
 state=r(state,{type:'fill',tick:0,pitch:62,id:'db'});
 state=r(state,{type:'add-tone',id:'db',pitch:65,toneId:'f'});
 const original=state,steps=m.scoreSteps(state.events);
 assert.equal(m.eventTones(state.events[0])[0].spelling.accidental,-1);
 state=r(state,{type:'replace-score',steps,seed:'noop'});assert.equal(state,original);
 const changed=steps.map((step,i)=>i===1?{...step,midi:67}:step);
 state=r(state,{type:'replace-score',steps:changed,seed:'new'});
 assert.equal(state.events[0].id,'db');assert.deepEqual(m.eventTones(state.events[0]),m.eventTones(original.events[0]));
 assert.equal(state.events[1].id,original.events[1].id);assert.equal(state.events[1].midi,67);
 state=r(state,{type:'undo'});assert.equal(state.events,original.events);
});
test('model rejects partial/invalid and final-expanded scores without changing history',()=>{
 const state=m.emptyEditor();
 const candidates=[[],[{midi:60,beats:1}],[{midi:-1,beats:4}],[{midi:null,pitches:[60,64],beats:4}],
  [{midi:60,beats:.125}],[{midi:60,pitches:[60,60],beats:4}],
  [{midi:60,beats:1},{midi:62,beats:4},{midi:null,beats:1},{midi:null,beats:1}],
  Array.from({length:17},()=>({midi:null,beats:4})),Array.from({length:65},()=>({midi:60,beats:4}))];
 for(const steps of candidates){const next=r(state,{type:'replace-score',steps,seed:'bad'});assert.equal(next.events,state.events);assert.equal(next.past,state.past);assert.equal(next.revision,0);}
 const stale=r(state,{type:'replace-score',steps:[{midi:60,beats:4}],seed:'stale',revision:1});assert.equal(stale,state);
});
