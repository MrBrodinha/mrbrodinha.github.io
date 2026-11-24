import assert from 'node:assert/strict';
import test from 'node:test';
import abcjs from 'abcjs';
import {scoreModel as s,model as m,notation,layout,parseSheetCode,codeUrl,parserUrl,musicUrl} from './sheetEditorModules.mjs';
const units=value=>value*420;
const {scoreCodeSnapshot,sourceKey}=await import(codeUrl),{linkedScoreRange}=await import(parserUrl),{MUSICAL_KEYS}=await import(musicUrl);
const part=(id,clef,steps)=>({id,clef,steps});
const steps=(...notes)=>notes.map(midi=>({midi,beats:1}));
const chord=(pitches,beats=4)=>({midi:pitches[0],pitches,beats});
const imported=(staffs,bpm=120,key='C')=>s.scoreReducer(s.emptyScore(),{type:'apply',value:{staffs,bpm,key},seed:'test'});
const select=(state,staffIndex,eventIndex=0,toneIndex=0,toggle=false)=>{const staff=state.score.staffs[staffIndex],event=staff.events[eventIndex];return s.scoreReducer(state,{type:'select',staffId:staff.id,eventId:event.id,toneId:m.eventTones(event)[toneIndex]?.id,toggle});};
const edit=state=>s.scoreReducer(state,{type:'mode',mode:'edit'});
const midi=state=>s.arrangement(state.score).map(events=>events.map(e=>e.pitches??e.midi));
const source=value=>`const BPM=${value.bpm??120};const KEY='${value.key??'C'}';const TIME_SIGNATURE='4/4';const STAVES=${JSON.stringify(value.staffs)};`;

test('treble/bass windows use F6 and their own E4/G2 anchor, with full MIDI independent',()=>{
 const g={left:10,right:500,bottom:300,step:5};
 for(const [bottom,minimum] of [[64,53],[43,29]])for(const n of m.NATURAL_PITCHES)assert.equal(m.staffPitch({x:100,y:m.pitchY(n,g,bottom)},g,bottom,minimum),n>=minimum&&n<=89?n:null);
 assert.equal(m.pitchY(43,g,43),300);assert.equal(m.pitchY(29,g,43),340);
 assert.equal(s.inputPitch(65,'key','G').accidental,1);assert.equal(s.inputPitch(71,'key','F').accidental,-1);
 for(const key of MUSICAL_KEYS)assert.ok(Object.values(s.keyAccidentals(key)).every(v=>v===-1||v===1));
 assert.equal(m.pitchMidi(s.inputPitch(65,0,'G')),65);assert.equal(m.pitchMidi(s.inputPitch(71,'key','Dm')),70);
});

test('cross-part selected semitones move simultaneously into selected old slots, retain IDs and undo once',()=>{
 let state=edit(imported([part('a','treble',[chord([60,61,67])]),part('b','bass',[chord([36,40])])]));
 state=select(state,0,0,0);state=select(state,0,0,1,true);state=select(state,1,0,1,true);
 const before=state,refs=state.selection;
 state=s.scoreReducer(state,{type:'transpose',delta:1});assert.deepEqual(midi(state),[[[61,62,67]],[[36,41]]]);assert.deepEqual(state.selection,refs);assert.equal(state.past.length,before.past.length+1);
 assert.deepEqual(s.selectedPitches(state),[41,61,62]);assert.equal(s.scoreReducer(state,{type:'undo'}).score,before.score);
 const stale=s.scoreReducer(state,{type:'transpose',delta:1,context:before.context});assert.equal(stale,state);
});

test('group collisions, absolute range and deletion rest-cap failures reject every part atomically',()=>{
 let state=edit(imported([part('a','treble',[chord([60,61])]),part('b','bass',[{midi:40,beats:4}])]));state=select(state,0);state=select(state,1,0,0,true);
 let next=s.scoreReducer(state,{type:'transpose',delta:1});assert.equal(next.score,state.score);assert.equal(next.past,state.past);
 for(const [n,delta] of [[0,-1],[127,1]]){let state=edit(imported([part('a','treble',[{midi:n,beats:4}]),part('b','bass',[{midi:40,beats:4}])]));state=select(select(state,0),1,0,0,true);next=s.scoreReducer(state,{type:'transpose',delta});assert.equal(next.score,state.score);}
 state=edit(imported([part('a','treble',Array.from({length:64},()=>({midi:60,beats:4}))),part('b','bass',Array.from({length:64},()=>({midi:40,beats:4})))]));state=select(select(state,0),1,0,0,true);next=s.scoreReducer(state,{type:'delete-selection'});assert.equal(next.score,state.score);assert.match(next.message,/64/);
});

test('Shift toggles primary identities, rests and empty selection safely; group deletion preserves common time',()=>{
 let state=edit(imported([part('a','treble',[chord([60,64])]),part('b','bass',steps(36,null,38,null))]));state=select(state,0);state=select(state,0,0,1,true);state=select(state,1,2,0,true);
 assert.equal(s.primary(state).staffId,'b');state=select(state,1,2,0,true);assert.equal(s.primary(state).staffId,'a');state=select(state,1,1,0,true);assert.equal(state.selection.length,2);
 const before=state.score;state=s.scoreReducer(state,{type:'delete-selection'});assert.equal(state.selection.length,0);assert.ok(state.score.staffs[0].events.every(e=>e.midi===null));assert.ok(state.score.staffs.every(p=>m.totalTicks(p.events)===m.MEASURE_TICKS));assert.equal(s.scoreReducer(state,{type:'undo'}).score,before);
});

test('staff/global operations are complete snapshots; no-op settings, context and normalized Apply add no history',()=>{
 let state=s.emptyScore();const initial=state.score;state=s.scoreReducer(state,{type:'add-measure'});assert.equal(m.totalTicks(state.score.staffs[0].events)/420,32);
 for(let i=2;i<=4;i++){const before=state.score;state=s.scoreReducer(state,{type:'add-staff',id:'staff-'+i,clef:i%2?'treble':'bass'});assert.equal(state.score.staffs[0],before.staffs[0]);assert.equal(state.score.staffs.at(-1).events.length,8);}
 assert.equal(s.scoreReducer(state,{type:'add-staff',id:'fifth',clef:'bass'}).score,state.score);
 const snapshots=[];for(const action of [{type:'bpm',value:60},{type:'key',value:'Gm'},{type:'clef',staffId:'staff-1',value:'bass'},{type:'remove-staff',staffId:'staff-2'},{type:'reset'}]){snapshots.push(state.score);state=s.scoreReducer(state,action);}
 for(const score of snapshots.reverse()){state=s.scoreReducer(state,{type:'undo'});assert.equal(state.score,score);}
 const unchanged=s.scoreReducer(state,{type:'apply',value:parseSheetCode(scoreCodeSnapshot(state.score).code),seed:'noop'});assert.equal(unchanged,state);
 assert.equal(s.scoreReducer(state,{type:'bpm',value:state.score.bpm}),state);assert.equal(s.scoreReducer(s.emptyScore(),{type:'remove-staff',staffId:'staff-1'}).score.staffs.length,1);assert.ok(initial.staffs[0].events.every(e=>e.midi===null));
});

test('adding a staff/measure rejects all parts if any final rest coverage exceeds cap',()=>{
 const state=imported([part('a','treble',Array.from({length:64},()=>({midi:60,beats:4})))]);
 for(const action of [{type:'add-staff',id:'b',clef:'bass'},{type:'add-measure'}]){const next=s.scoreReducer(state,action);assert.equal(next.score,state.score);assert.equal(next.past,state.past);assert.match(next.message,/64/);}
});

test('tempo/keys/clefs preserve music and selection; explicit accidental entry and pitch-caret boundaries are silent model transitions',()=>{
 let state=edit(imported([part('a','treble',[chord([60,64])])]));state=select(state,0,0,1);const events=state.score.staffs[0].events,selection=state.selection;
 for(const action of [{type:'bpm',value:20},{type:'bpm',value:400},{type:'key',value:'F#'},{type:'clef',staffId:'a',value:'bass'}]){state=s.scoreReducer(state,action);assert.equal(state.score.staffs[0].events,events);assert.equal(state.selection,selection);}
 for(const bpm of [0,19,401,60.5,NaN])assert.equal(s.scoreReducer(state,{type:'bpm',value:bpm}).score,state.score);
 state=s.scoreReducer(s.emptyScore(),{type:'key',value:'G'});state=s.scoreReducer(state,{type:'part',action:{type:'fill',id:'f',tick:units(0),pitch:65}});assert.equal(state.score.staffs[0].events[0].midi,65);
 state=s.scoreReducer(state,{type:'entry-accidental',value:0});state=s.scoreReducer(state,{type:'part',action:{type:'fill',id:'natural',tick:units(4),pitch:65}});assert.equal(state.score.staffs[0].events[1].midi,65);
 state={...state,pitch:0,accidental:-1};const next=s.scoreReducer(state,{type:'pitch-step',delta:-1});assert.equal(next.pitch,0);assert.equal(next.score,state.score);
});

test('STAVES round trips every key and exact nested source ranges with stable score identities',()=>{
 for(const key of MUSICAL_KEYS){const state=imported([part('upper','treble',[chord([60,64,67])]),part('lower','bass',steps(29,null,89,127))],60,key),snapshot=scoreCodeSnapshot(state.score),parsed=parseSheetCode(snapshot.code);
  assert.equal(parsed.key,key);assert.equal(parsed.bpm,60);assert.equal(parsed.staffs.length,2);assert.equal(s.scoreReducer(state,{type:'apply',value:parsed,seed:'again'}),state);
  for(const p of state.score.staffs)for(const event of p.events){const range=snapshot.ranges[sourceKey(p.id,event.id)];assert.ok(snapshot.code.slice(range.start,range.end).startsWith('{"midi":'));assert.deepEqual(linkedScoreRange(parsed,state.score,p.id,event.id),range);}
 }
 const code=source({staffs:[part('a','bass',[chord([36,40])])]}).replace('{"midi"','{\n/* actual nested offset */\n"midi"'),parsed=parseSheetCode(code);assert.ok(parsed.staffRanges.a[0].endLine>parsed.staffRanges.a[0].startLine);
});

test('modern/legacy reader rejects ambiguous, unsafe, unequal, over-cap and executable documents atomically',()=>{
 const base={staffs:[part('a','treble',[{midi:60,beats:4}])]},valid=source(base);globalThis.scoreSentinel=0;
 const invalid=[valid+';globalThis.scoreSentinel=1',valid+'const MELODY=[]',valid.replace('STAVES=','STAVES=(()=>{globalThis.scoreSentinel=1;return ')+');',valid.replace('"treble"','"perc"'),valid.replace('"a"','"bad id"'),source({staffs:[...base.staffs,...base.staffs]}),source({staffs:Array.from({length:5},(_,i)=>part('p'+i,'bass',[{midi:null,beats:4}]))}),source({staffs:[...base.staffs,part('b','bass',steps(36,null,null,null,36,null,null,null))]}),source({staffs:[part('a','bass',[{midi:60,beats:1}])]}),source({staffs:[part('a','bass',Array.from({length:64},()=>({midi:null,beats:4})))]}),valid.replace('120','401'),valid.replace('BPM=', 'BPM: ScoreStaff[]='),valid.replace('STAVES=', 'STAVES: ScoreStep[]='),valid.replace("KEY='C'","KEY='H'"),valid.replace('"beats":4','"beats":4,"beats":4'),valid.replace('"midi":60','"midi":128'),valid.replace('"midi":60','"midi":null,"pitches":[36,40]'),valid+' '.repeat(250001)];
 for(const text of invalid)assert.throws(()=>parseSheetCode(text));assert.equal(globalThis.scoreSentinel,0);delete globalThis.scoreSentinel;
 const legacy=parseSheetCode("const BPM=80;const KEY='Dm';const TIME_SIGNATURE='4/4';const MELODY=[{midi:29,beats:4}];");assert.deepEqual([legacy.bpm,legacy.key,legacy.staffs[0].clef],[80,'Dm','treble']);
});

test('common tick cuts split another part’s long event into tied display fragments, preserving all times/IDs',()=>{
 const state=imported([part('dense','treble',Array.from({length:32},(_,i)=>({midi:60+i%5,beats:.25}))),part('long','bass',[{midi:36,beats:4},{midi:36,beats:4}])]),before=JSON.stringify(state.score);
 const cuts=layout.scoreRowCuts(state.score,{},150);assert.ok(cuts.some(t=>t%(16*420)!==0));const output=notation.scoreNotation(state.score,cuts);
 const tune=abcjs.parseOnly(output.abc)[0],lines=tune.lines.filter(l=>l.staff);assert.equal(lines.length,cuts.length+1);assert.ok(lines.every(l=>l.staff.length===2));
 const durations=[0,0];for(const line of lines)line.staff.forEach((staff,i)=>staff.voices.flat().forEach(note=>{if(note.el_type==='note'&&!['spacer','invisible'].includes(note.rest?.type))durations[i]+=note.duration;}));assert.deepEqual(durations,[2,2]);
 assert.ok(output.fragments.filter(f=>f.staffIndex===1&&f.eventIndex===0).length>1);assert.match(output.abc,/C,,.*-/);assert.equal(JSON.stringify(state.score),before);
});

test('direct entry activates its actual part and caret rejects invalid/stale coordinates without history',()=>{
 let state=s.scoreReducer(s.emptyScore(),{type:'add-staff',id:'bass',clef:'bass'});assert.equal(state.active,'bass');
 state=s.scoreReducer(state,{type:'part',staffId:'staff-1',action:{type:'fill',id:'upper-entry',tick:units(0),pitch:65}});assert.equal(state.active,'staff-1');assert.equal(state.score.staffs[0].events[0].midi,65);assert.ok(state.score.staffs[1].events.every(e=>e.midi===null));
 for(const action of [{type:'caret',tick:units(4),pitch:60,staffId:'missing'},{type:'caret',tick:units(1000),pitch:60},{type:'caret',tick:units(4),pitch:61}])assert.equal(s.scoreReducer(state,action),state);
 const next=s.scoreReducer(state,{type:'caret',tick:units(4),pitch:29,staffId:'bass'});assert.equal(next.active,'bass');assert.equal(next.score,state.score);assert.equal(next.past,state.past);
});

test('each part keeps its own key accidentals across continuation cuts without adding a musical bar',()=>{
 const state=imported([part('a','treble',steps(66,65,66,65)),part('b','bass',steps(65,66,65,66))],120,'G');
 const built=notation.scoreNotation(state.score,[units(6)]);assert.match(built.abc,/K:G/);assert.ok(built.abc.includes('=F'));assert.ok(built.abc.includes('^F'));assert.ok(built.fragments.some(f=>f.start===units(6)));
 const parsed=abcjs.parseOnly(built.abc)[0].lines.filter(l=>l.staff),bars=[0,0],totals=[0,0];for(const l of parsed)l.staff.forEach((staff,i)=>staff.voices.flat().forEach(n=>{if(n.el_type==='bar')bars[i]++;if(n.el_type==='note')totals[i]+=n.duration;}));
 assert.deepEqual(totals,[1,1]);assert.deepEqual(bars,[1,1]);assert.ok(built.fragments.filter(f=>f.eventIndex===1).length===4);
});

test('single-part adapter cannot bypass global measure, import or history transactions',()=>{
 const state=s.scoreReducer(s.emptyScore(),{type:'add-staff',id:'bass',clef:'bass'});
 for(const action of [{type:'add-measure'},{type:'undo'},{type:'clear'},{type:'replace-score',steps:[{midi:60,beats:1}],seed:'invalid'}])assert.equal(s.scoreReducer(state,{type:'part',staffId:'bass',action}),state);
});

test('Place selects each newly filled note including the final slot and semitone edits keep its identity/time',()=>{
 let state=s.emptyScore();for(const [i,pitch] of [60,62,64,65].entries()){
  state=s.scoreReducer(state,{type:'part',action:{type:'fill',id:'new-'+i,tick:units(i*4),pitch}});
  assert.equal(state.mode,'place');assert.equal(s.primary(state).eventId,'new-'+i);assert.equal(state.selection.length,1);
 }
 const ref=s.primary(state),before=state.score;
 state=s.scoreReducer(state,{type:'transpose',delta:1});assert.equal(s.toneFor(state.score,ref).spelling.accidental,1);assert.equal(state.score.staffs[0].events[3].midi,66);assert.deepEqual(state.selection,[ref]);assert.equal(m.totalTicks(state.score.staffs[0].events)/420,16);assert.equal(s.scoreReducer(state,{type:'undo'}).score,before);
});

test('Place duration edits preserve onset/later notes, rehome the entry caret and carry collisions atomically',()=>{
 let state=s.scoreReducer(s.emptyScore(),{type:'part',action:{type:'fill',id:'first',tick:units(0),pitch:60}}),before=state.score,ref=s.primary(state);
 state=s.scoreReducer(state,{type:'part',action:{type:'duration',id:'first',duration:'half'}});assert.equal(state.score.staffs[0].events[0].duration,'half');assert.deepEqual(state.selection,[ref]);assert.equal(state.tick/420,8);assert.equal(state.duration,'quarter');assert.equal(s.scoreReducer(state,{type:'undo'}).score,before);
 state=s.scoreReducer(state,{type:'part',action:{type:'fill',id:'later',tick:units(8),pitch:67}});assert.equal(s.primary(state).eventId,'later');
 state=s.scoreReducer(state,{type:'select',staffId:'staff-1',eventId:'first'});before=state.score;
 const carried=s.scoreReducer(state,{type:'part',action:{type:'duration',id:'first',duration:'whole'}});assert.notEqual(carried.score,before);assert.deepEqual(carried.selection,state.selection);assert.equal(m.timedEvents(carried.score.staffs[0].events).find(e=>e.event.id==='later').start,m.MEASURE_TICKS);assert.equal(s.scoreReducer(carried,{type:'undo'}).score,before);
 assert.equal(s.scoreReducer(state,{type:'part',action:{type:'duration',id:'later',duration:'half'}}),state,'only the selected Place event can be edited');
 state=s.scoreReducer(state,{type:'part',action:{type:'duration',id:'first',duration:'eighth'}});assert.equal(state.tick/420,2);assert.equal(m.timedEvents(state.score.staffs[0].events).find(e=>e.event.id==='later').start/420,8);
});

test('Place selects just the added chord member and clears editing selection when navigating to another entry position',()=>{
 let state=s.scoreReducer(s.emptyScore(),{type:'part',action:{type:'fill',id:'chord',tick:units(0),pitch:60}});
 state=s.scoreReducer(state,{type:'part',action:{type:'add-tone',id:'chord',toneId:'e',pitch:64}});assert.equal(s.primary(state).toneId,'e');state=s.scoreReducer(state,{type:'transpose',delta:1});assert.deepEqual(s.arrangement(state.score)[0][0].pitches,[60,65]);
 state=s.scoreReducer(state,{type:'part',action:{type:'duration',id:'chord',duration:'half'}});assert.equal(state.score.staffs[0].events[0].duration,'half');assert.deepEqual(s.arrangement(state.score)[0][0].pitches,[60,65]);
 state=s.scoreReducer(state,{type:'caret',tick:units(8),pitch:67});assert.equal(state.selection.length,0);const before=state.score;state=s.scoreReducer(state,{type:'pitch-step',delta:1});assert.equal(state.score,before);assert.equal(state.pitch,69);
});
