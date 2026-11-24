import assert from 'node:assert/strict';
import test from 'node:test';
import abcjs from 'abcjs';
import { model, notation } from './sheetEditorModules.mjs';
const { emptyEditor, editorReducer: reduce, eventTones, entryPitch, pitchMidi, scoreSteps, tentativeOperation } = model;
const insert=(state,id,pitch,tick=0)=>reduce(state,{type:'fill',id,pitch,tick});
const add=(state,id,pitch,toneId)=>reduce(state,{type:'add-tone',id,pitch,toneId});
const midis=event=>eventTones(event).map(tone=>pitchMidi(tone.spelling));
const parsed=events=>abcjs.parseOnly(notation.sheetNotation(events).abc)[0].lines.flatMap(line=>line.staff?.flatMap(staff=>staff.voices.flat())??[]).filter(note=>note.el_type==='note'&&!['spacer','invisible'].includes(note.rest?.type));
// Formatter-only fixtures may include legacy bar-crossing events; UI fills stay in one bar.
const sequence=specs=>({...emptyEditor(),events:specs.map(([midi,duration],i)=>({id:String(i),midi,duration}))});

test('chord additions retain one onset/duration and independent member identities through edits and undo',()=>{
 let state=add(add(insert(emptyEditor(),'c',60),'c',64,'e'),'c',67,'g');
 assert.deepEqual(midis(state.events[0]),[60,64,67]);assert.equal(state.selectedId,null);assert.equal(state.targetId,'c');
 const original=state.events;state=reduce(state,{type:'tool',duration:'whole'});
 state=add(state,'c',72,'high');assert.equal(state.events[0].duration,'quarter');
 state=reduce(state,{type:'mode',mode:'edit'});state=reduce(state,{type:'select',id:'c',toneId:'e'});
 state=reduce(state,{type:'transpose',id:'c',delta:1});assert.deepEqual(midis(state.events[0]),[60,65,67,72]);assert.equal(state.selectedToneId,'e');
 state=reduce(state,{type:'remove-tone',id:'c'});assert.deepEqual(midis(state.events[0]),[60,67,72]);
 state=reduce(state,{type:'undo'});assert.equal(eventTones(state.events[0]).find(t=>t.id==='e').spelling.letter,'F');
 assert.deepEqual(midis(original[0]),[60,64,67]);assert.equal(model.totalTicks(state.events)/420,16);
});
test('enharmonic duplicates and colliding edits preserve history, spelling and sounding membership',()=>{
 let state=reduce(emptyEditor(),{type:'entry-accidental',value:1});state=insert(state,'cs',60);
 const events=state.events,past=state.past;state=reduce(state,{type:'add-tone',id:'cs',pitch:62,spelling:entryPitch(62,-1),toneId:'db'});
 assert.equal(state.events,events);assert.equal(state.past,past);assert.equal(eventTones(state.events[0])[0].spelling.letter,'C');
 state=reduce(state,{type:'entry-accidental',value:0});state=add(state,'cs',60,'natural');
 state=reduce(state,{type:'mode',mode:'edit'});state=reduce(state,{type:'select',id:'cs',toneId:'natural'});
 const before=state.events;state=reduce(state,{type:'accidental',value:1});assert.equal(state.events,before);assert.match(state.message,/already uses/);
});
test('eight-tone cap, range and rest targets reject without history; pending chords consume no time',()=>{
 let state=insert(emptyEditor(),'c',60);for(const pitch of [62,64,65,67,69,71,72])state=add(state,'c',pitch,String(pitch));
 const before=state.events,past=state.past;state=add(state,'c',74,'ninth');assert.equal(state.events,before);assert.equal(state.past,past);
 const rest=emptyEditor();assert.equal(add(rest,rest.events[0].id,64,'e').events,rest.events);
 const base=insert(emptyEditor(),'c',60),command={kind:'add-tone',eventId:'c',pitch:64};
 const preview=tentativeOperation(base.events,command,{duration:'whole',accidental:0});assert.equal(model.totalTicks(preview)/420,16);assert.deepEqual(midis(preview[0]),[60,64]);assert.deepEqual(midis(base.events[0]),[60]);
 assert.notEqual(notation.scoreSignature(preview),notation.scoreSignature(base.events));
});
test('accidental and chromatic edits retain explicit spelling, idempotence and MIDI-domain bounds',()=>{
 let state=reduce(emptyEditor(),{type:'entry-accidental',value:-1});state=insert(state,'db',62);
 state=reduce(state,{type:'mode',mode:'edit'});state=reduce(state,{type:'select',id:'db'});
 state=reduce(state,{type:'accidental',value:1});assert.equal(model.pitchKey(model.activeTone(state).spelling),'D#4');
 assert.equal(reduce(state,{type:'accidental',value:1}),state);assert.equal(state.accidental,-1);
 state=reduce(state,{type:'accidental',value:0});state=reduce(state,{type:'transpose',id:'db',delta:-1});assert.equal(state.events[0].midi,61);
 for(const [pitch,delta] of [[0,-1],[127,1]]){
  let boundary=insert(emptyEditor(),'edge',pitch);boundary=reduce(boundary,{type:'mode',mode:'edit'});boundary=reduce(boundary,{type:'select',id:'edge'});
  const result=reduce(boundary,{type:'transpose',id:'edge',delta});assert.equal(result.events,boundary.events);assert.equal(result.past,boundary.past);
 }
});

test('real ABC beams eighths, sixteenths and mixed values within denominator beats',()=>{
 for(const specs of [Array(8).fill([60,'eighth']),Array(16).fill([60,'sixteenth']),[[60,'eighth'],[62,'sixteenth'],[64,'sixteenth']],[...Array(3).fill([60,'eighth']),[62,'sixteenth'],[64,'sixteenth'],...Array(4).fill([67,'eighth'])]]){
  const state=sequence(specs),notes=parsed(state.events);
  const spans=model.timedEvents(state.events).filter(span=>span.event.midi!==null);
  notes.forEach((note,index)=>{const beat=Math.floor(spans[index].start/model.TICKS_PER_BEAT);const previous=index>0&&Math.floor(spans[index-1].start/model.TICKS_PER_BEAT)===beat;const next=index+1<notes.length&&Math.floor(spans[index+1].start/model.TICKS_PER_BEAT)===beat;assert.equal(Boolean(note.startBeam),!previous&&next);assert.equal(Boolean(note.endBeam),previous&&!next);});
 }
 const isolated=parsed(sequence([[60,'eighth']]).events);assert.equal(Boolean(isolated[0].startBeam),false);assert.equal(Boolean(isolated[0].endBeam),false);
});

test('rests, long values and measures break beams without changing duration or membership',()=>{
 const rest=parsed(sequence([[60,'eighth'],[null,'eighth'],[64,'eighth'],[65,'eighth']]).events);
 assert.equal(Boolean(rest[0].startBeam),false);assert.ok(rest[2].startBeam);assert.ok(rest[3].endBeam);
 const long=parsed(sequence([[60,'eighth'],[64,'quarter'],[65,'eighth']]).events);assert.ok(long.every(note=>!note.startBeam&&!note.endBeam));
 const split=parsed(sequence([[60,'half'],[60,'quarter'],[62,'sixteenth'],[64,'sixteenth'],[65,'quarter']]).events);
 assert.ok(split[2].startBeam);assert.ok(split[3].endBeam);
 assert.ok(split.slice(4).every(note=>!note.startBeam&&!note.endBeam),'short tied fragments of a long event must not join a neighboring beam');
 const state=sequence(Array(10).fill([60,'eighth'])),notes=parsed(state.events);
 assert.equal(notes.length,10);assert.equal(notes.reduce((sum,note)=>sum+note.duration,0),1.25);
 assert.ok(notes[7].endBeam);assert.ok(notes[8].startBeam);
});

test('beamed and bar-crossing chords retain every pitch, per-member spelling and ties',()=>{
 let state=sequence(Array.from({length:8},(_,i)=>[i%2?62:60,'eighth']));state=add(add(state,'0',64,'e'),'1',65,'f');
 let notes=parsed(state.events);assert.equal(notes[0].pitches.length,2);assert.equal(notes[1].pitches.length,2);assert.ok(notes[0].startBeam);assert.ok(notes[7].endBeam);
 state=sequence([[60,'quarter'],[62,'whole']]);state=add(state,'1',65,'f');
 const built=notation.sheetNotation(state.events);assert.deepEqual(built.stepIndices,[0,1,1]);
 notes=parsed(state.events);assert.ok(notes[1].pitches.every(pitch=>pitch.startTie));assert.ok(notes[2].pitches.every(pitch=>pitch.endTie));
});

test('adjacent seconds and distinct alterations of one staff pitch retain all written and sounding tones',()=>{
 let state=insert(emptyEditor(),'c',60);state=add(state,'c',62,'d');
 state=reduce(state,{type:'add-tone',id:'c',pitch:60,spelling:entryPitch(60,1),toneId:'cs'});
 const note=parsed(state.events)[0];
 assert.equal(note.pitches.length,3);assert.deepEqual(midis(state.events[0]),[60,61,62]);
 assert.deepEqual(note.pitches.map(pitch=>[pitch.pitch,pitch.accidental??'natural']),[[0,'natural'],[0,'sharp'],[1,'natural']]);
 const explicit=tentativeOperation(state.events,{kind:'add-tone',eventId:'c',pitch:64,spelling:entryPitch(64,0)},{duration:'whole',accidental:1});
 assert.deepEqual(midis(explicit[0]),[60,61,62,64],'native Add tone previews its explicit pitch with the explicit spelling');
});

test('explicit flats/sharps/natural cancellations, enharmonic octaves and zero-time spacers survive notation',()=>{
 const ev=(id,midi,duration,accidental=0)=>({id,midi:midi+accidental,duration,spelling:entryPitch(midi,accidental)});
 const events=[ev('db',62,'quarter',-1),ev('cs',60,'quarter',1),ev('fs',65,'quarter',1),ev('fn',65,'quarter'),ev('long',72,'whole',1)];
 const built=notation.sheetNotation(events);for(const symbol of ['_D','^C','^F','=F'])assert.ok(built.abc.includes(symbol));
 const voice=abcjs.parseOnly(built.abc)[0].lines.flatMap(line=>line.staff?.flatMap(staff=>staff.voices.flat())??[]);
 const spacers=voice.filter(event=>event.rest?.type==='spacer');assert.equal(spacers.length,2);assert.ok(spacers.every(event=>event.duration===0));
 assert.equal(voice.filter(event=>event.el_type==='note').reduce((sum,event)=>sum+event.duration,0),2);
 const enharmonics=[ev('es',64,'quarter',1),ev('fb',65,'quarter',-1),ev('bs',71,'quarter',1),ev('cb',72,'quarter',-1)];
 assert.deepEqual(scoreSteps(enharmonics).map(event=>event.midi),[65,64,72,71]);
 const abc=notation.sheetNotation(enharmonics).abc;for(const symbol of ['^E','_F','^B','_c'])assert.ok(abc.includes(symbol));
 for(const [delta,expected] of [[1,'C#5'],[-1,'B4']]){
  let state=insert(emptyEditor(),'octave',72);state=reduce(state,{type:'mode',mode:'edit'});state=reduce(state,{type:'select',id:'octave'});
  state=reduce(state,{type:'transpose',id:'octave',delta});assert.equal(model.pitchKey(model.activeTone(state).spelling),expected);assert.equal(state.selectedId,'octave');
 }
});
