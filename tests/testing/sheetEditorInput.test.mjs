import assert from 'node:assert/strict';
import test from 'node:test';
import { model as m, scoreModel as s, notation, playback, parseSheetCode, codeUrl } from './sheetEditorModules.mjs';
const {scoreCodeSnapshot}=await import(codeUrl);
let serial = 0;
const B = m.TICKS_PER_BEAT;
const events = state => state.score.staffs[0].events;
const write = (state, pitch) => s.scoreReducer(state.mode==='place'?state:s.scoreReducer(state,{type:'mode',mode:'place'}), { type: 'part', action: { type: 'fill', tick: state.tick, pitch, id: `sheet-${++serial}` } });
const pick = (state, event, index = 0) => s.scoreReducer(state, { type: 'select', staffId: state.active, eventId: event.id, toneId: m.eventTones(event)[index]?.id });
const edit = state => s.scoreReducer(state, { type: 'mode', mode: 'edit' });
const tuplet = (state, eventId, extra = {}) => s.scoreReducer(state.mode==='edit'?state:s.scoreReducer(state,{type:'mode',mode:'edit'}), { type: 'apply-tuplet', staffId: state.active, eventId, count: 3, duration: 'eighth', id: `group-${++serial}`, ...extra });

test('automatic tuplet values exactly subdivide ordinary and dotted rests without borrowing silence', () => {
 const cases=[
  ['quarter',false,{3:'eighth',5:'sixteenth',6:'sixteenth',7:'sixteenth'}],
  ['quarter',true,{2:'eighth',4:'eighth',8:'sixteenth'}],
  ['half',false,{3:'quarter',5:'eighth',6:'eighth',7:'eighth'}],
  ['half',true,{2:'quarter',4:'quarter',8:'eighth'}],
  ['whole',false,{3:'half',5:'quarter',6:'quarter',7:'quarter'}],
  ['eighth',false,{3:'sixteenth'}],['sixteenth',false,{}],['thirty-second',false,{}],
 ];
 for(const [duration,dotted,expected] of cases){
  const state=s.emptyScore(),staff=state.score.staffs[0],rest={...staff.events[0],duration,dotted};
  const score={...state.score,staffs:[{...staff,events:[rest]}]};
  for(const count of Object.keys(m.TUPLET_RATIOS))assert.equal(s.tupletValueForRest(score,staff.id,rest.id,Number(count)),expected[count]??null,`${duration} dotted=${dotted}, count=${count}`);
 }
 const state=s.emptyScore(),staff=state.score.staffs[0];
 assert.equal(s.tupletValueForRest(state.score,'missing',staff.events[0].id,3),null);
 assert.equal(s.tupletValueForRest(state.score,staff.id,'missing',3),null);
 assert.equal(s.tupletValueForRest(state.score,staff.id,staff.events[0].id,9),null);
 const pitched=write(state,60);assert.equal(s.tupletValueForRest(pitched.score,staff.id,events(pitched)[0].id,3),null);
 let grouped=tuplet(state,staff.events[0].id);const members=events(grouped).filter(event=>event.tuplet);
 assert.equal(s.tupletValueForRest(grouped.score,staff.id,members[1].id,5),'sixteenth');
 grouped=write(grouped,60);assert.equal(s.tupletValueForRest(grouped.score,staff.id,members[1].id,5),null);
});

test('sheet entry advances through rests and extends the complete arrangement at the endpoint', () => {
 let state=s.scoreReducer(s.emptyScore(),{type:'add-staff',id:'lower',clef:'bass'});
 for(const [i,pitch] of [60,62,64,65].entries()){state=write(state,pitch);assert.equal(state.tick,(i+1)*B);assert.equal(state.selection.length,1);}
 const before=state.score,history=state.past.length;state=write(state,67);
 assert.equal(state.past.length,history+1);assert.ok(state.score.staffs.every(part=>m.totalTicks(part.events)===8*B));assert.equal(s.scoreReducer(state,{type:'undo'}).score,before);
});

test('sheet input follows explicit accidentals even under a different key signature', () => {
 let state=s.scoreReducer(s.emptyScore(),{type:'key',value:'F'});state=write(state,71);assert.equal(events(state)[0].midi,71);
 state=s.scoreReducer(state,{type:'entry-accidental',value:-1});state=write(state,71);assert.equal(events(state)[1].midi,70);
 assert.equal(state.accidental,-1);state=s.scoreReducer(state,{type:'entry-accidental',value:0});state=write(state,60);assert.equal(events(state)[2].midi,60);
});

test('sheet chord edits change one selected member, preserve rhythm and Undo, and reject collisions', () => {
 let state=write(s.emptyScore(),60);const id=events(state)[0].id;
 for(const pitch of [64,67])state=s.scoreReducer(state,{type:'part',action:{type:'add-tone',id,pitch,toneId:`tone-${pitch}`}});
 state=pick(edit(state),events(state)[0],1);const before=state.score;
 state=s.scoreReducer(state,{type:'transpose',delta:1});assert.deepEqual(m.scoreSteps(events(state))[0].pitches,[60,65,67]);assert.equal(m.eventTicks(events(state)[0]),B);
 assert.equal(s.scoreReducer(state,{type:'undo'}).score,before);
 state=s.scoreReducer(state,{type:'transpose',delta:1});const collision=state.score;state=s.scoreReducer(state,{type:'transpose',delta:1});assert.equal(state.score,collision);
});

test('rest tuplets target an explicit staff without first selecting it or changing other staffs', () => {
 let state=s.scoreReducer(s.emptyScore(),{type:'add-staff',id:'alto',clef:'alto'});
 const upper=state.score.staffs[0],lower=state.score.staffs[1],before=state.score;
 state=tuplet(state,upper.events[0].id,{staffId:upper.id});
 assert.equal(state.active,upper.id);assert.equal(state.score.staffs[1],lower);assert.equal(state.rest.staffId,upper.id);
 const group=events(state).filter(event=>event.tuplet);assert.equal(group.length,3);assert.ok(group.every(event=>event.midi===null));assert.equal(group.reduce((sum,event)=>sum+m.eventTicks(event),0),B);
 assert.equal(s.scoreReducer(state,{type:'undo'}).score,before);
});

test('all supported rest-tuplet ratios produce exact slots and a no-op when reapplied unchanged', () => {
 for(const [countText,ratio] of Object.entries(m.TUPLET_RATIOS))for(const duration of m.NOTE_VALUES){
  const count=Number(countText),length=m.NOTE_TICKS[duration]*ratio/B;
  const before=s.scoreReducer(s.emptyScore(),{type:'meter',value:{numerator:Math.max(4,length),denominator:4}});let state=tuplet(before,events(before)[0].id,{count,duration});
  const group=events(state).filter(event=>event.tuplet);assert.equal(group.length,count);assert.equal(group.reduce((sum,event)=>sum+m.eventTicks(event),0),m.NOTE_TICKS[duration]*ratio);
  const repeated=tuplet(state,group.at(-1).id,{count,duration});assert.equal(repeated,state);
  assert.equal(s.scoreReducer(state,{type:'undo'}).score,before.score);
 }
});

test('rest tuplet updates/removal protect every pitched member, without overwriting notes', () => {
 let state=s.emptyScore();state=tuplet(state,events(state)[0].id);const empty=state.score;
 state=tuplet(state,events(state)[1].id,{count:5,duration:'sixteenth'});assert.equal(events(state).filter(event=>event.tuplet).length,5);
 state=write(state,60);const occupied=state.score,rest=events(state).find(event=>event.tuplet&&event.midi===null);
 assert.equal(tuplet(state,rest.id).score,occupied);assert.equal(tuplet(state,events(state)[0].id).score,occupied);
 let selected=pick(edit(state),rest);assert.equal(s.scoreReducer(selected,{type:'remove-tuplet'}).score,occupied);
 selected=s.scoreReducer(selected,{type:'entry-kind',value:'note'});assert.notEqual(selected.score,empty);
});

test('tuplet conflicts, cross-bar spans, caps, unsupported values and stale target callbacks are atomic', () => {
 let state=edit(write(s.emptyScore(),60));const original=state.score;
 assert.equal(tuplet(state,events(state)[0].id).score,original);
 const last=events(state).at(-1);assert.equal(tuplet(state,last.id,{duration:'quarter'}).score,original);
 for(const value of [{count:1},{duration:'thirty-second'},{staffId:'missing'},{eventId:'missing'},{id:'bad id'}])assert.equal(tuplet(state,last.id,value).score,original);
 assert.equal(tuplet(state,last.id,{revision:state.revision-1}),state);
 const steps=Array.from({length:64},()=>({midi:null,duration:'quarter'}));
 state=s.scoreReducer(s.emptyScore(),{type:'apply',value:{bpm:120,key:'C',staffs:[{id:'a',clef:'treble',steps}]},seed:'cap'});
 const rejected=tuplet(state,events(state)[0].id);assert.equal(rejected.score,state.score);assert.equal(rejected.past,state.past);
});

test('tuplet meter containment, previews and commits use the same pure score operation', () => {
 for(const meter of [{numerator:3,denominator:4},{numerator:6,denominator:8},{numerator:5,denominator:16}]){
  const state=s.scoreReducer(s.emptyScore(),{type:'meter',value:meter}),id=events(state)[0].id;
  const candidate=s.scoreWithTuplet(state.score,state.active,id,3,'eighth','preview');assert.ok(candidate);
  const committed=tuplet(state,id,{id:'preview'});assert.deepEqual(committed.score,candidate);assert.equal(m.totalTicks(events(committed)),m.totalTicks(events(state)));
  const last=events(state).at(-1);assert.equal(tuplet(state,last.id,{duration:'whole'}).score,state.score);
 }
});

test('sheet fills protected slots at fixed time despite a larger next-entry value, and resets the cursor', () => {
 let state=s.emptyScore();state=tuplet(state,events(state)[0].id,{count:7,duration:'sixteenth'});
 state=s.scoreReducer(state,{type:'tool',duration:'whole'});state=write(state,60);assert.equal(state.tick,B/7);assert.equal(events(state)[0].duration,'sixteenth');assert.equal(events(state).filter(event=>event.tuplet).length,7);
 state=s.scoreReducer(state,{type:'reset'});assert.equal(state.tick,0);assert.equal(state.pitch,64);assert.equal(state.duration,'quarter');assert.equal(s.isDefaultScore(state.score),true);
});

test('rest conversion and carry retain later pitches, and invalid or stale sheet input cannot partially write', () => {
 let state=write(s.emptyScore(),60);state=write(state,64);state=pick(edit(state),events(state)[0]);const before=state.score;
 const rest=s.scoreReducer(state,{type:'rest-value',duration:'half'});assert.equal(m.timedEvents(events(rest)).find(span=>span.event.midi===64).start,2*B);assert.equal(s.scoreReducer(rest,{type:'undo'}).score,before);
 for(const pitch of [NaN,Infinity,-1,128,60.5])assert.equal(write(s.emptyScore(),pitch).score.staffs[0].events.some(event=>event.midi!==null),false);
 assert.equal(s.scoreReducer(state,{type:'part',revision:state.revision-1,action:{type:'fill',tick:0,pitch:60,id:'stale'}}),state);
});

test('R16 preset range includes duplets through octuplets with exact timing',()=>{
 assert.deepEqual(Object.keys(m.TUPLET_RATIOS).map(Number),[2,3,4,5,6,7,8]);
 for(const [count,inTimeOf] of [[2,3],[8,6]]){
  const state=s.scoreReducer(s.emptyScore(),{type:'mode',mode:'edit'}),id=events(state)[0].id;
  const changed=tuplet(state,id,{count,duration:'sixteenth'});assert.equal(events(changed).filter(event=>event.tuplet).length,count);assert.equal(events(changed).filter(event=>event.tuplet).reduce((sum,event)=>sum+m.eventTicks(event),0),m.NOTE_TICKS.sixteenth*inTimeOf);
 }
 const original=s.emptyScore(),rejected=s.scoreReducer(original,{type:'apply-tuplet',staffId:original.active,eventId:events(original)[0].id,count:3,duration:'eighth',id:'write-blocked'});assert.equal(rejected.score,original.score);assert.equal(rejected.past,original.past);
});

test('R16 new presets round-trip code and preserve exact playback after filling their fixed slots',()=>{
 for(const [count,ratio] of [[2,3],[8,6]]){
  let state=tuplet(s.emptyScore(),events(s.emptyScore())[0].id,{count,duration:'sixteenth'});
  state=write(state,60);state=write(state,62);
  const group=events(state).filter(event=>event.tuplet),parsed=parseSheetCode(scoreCodeSnapshot(state.score).code);
  assert.equal(s.scoreReducer(state,{type:'apply',value:parsed,seed:'new-ratio-noop'}),state);
  assert.equal(group.length,count);assert.equal(group[0].tuplet.inTimeOf,ratio);
  assert.ok(notation.scoreNotation(state.score).abc.includes(`(${count}:${ratio}:${count}`));
  const notes=playback.performanceTimeline(state.score).events,seconds=m.NOTE_TICKS.sixteenth*ratio/count/B*.5;
  assert.equal(notes[0].duration,seconds);assert.equal(notes[1].time,seconds);assert.equal(notes[1].duration,seconds);
  const before=state.score;state=s.scoreReducer(state,{type:'mode',mode:'edit'});state=pick(state,group.find(event=>event.midi===null)??group[0]);
  const rejected=tuplet(state,group[0].id);assert.equal(rejected.score,before);
 }
});
