import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreModel as s, model as m, hookHostUrl, moduleUrl, sourceUrl, flatten } from './sheetEditorModules.mjs';
const hostUrl=hookHostUrl('Studio Piano'),host=await import(hostUrl),stub=moduleUrl('export default function Child() {}');
const {default:StudioPiano}=await import(await sourceUrl('src/components/testing/sheet-editor/StudioPiano.tsx',{
 react:hostUrl,'../../brodle/components/PianoControls':stub,'../../brodle/components/PianoKeyboard':stub,
}));
function mount(t){
 host.reset();t.after(()=>host.reset());const notes=[],calls=[],audio={stopAudio:()=>calls.push('stop'),startNote(){},releaseNote(){},playNotes(){},sound:'synth',volume:60,playing:null,pressedNotes:new Set()},props={audio,locked:false,mode:'place',selectedPitches:[60],onNote:midi=>notes.push(midi)};let nodes;
 const render=()=>{host.begin();nodes=flatten(StudioPiano(props));host.flush();};render();
 return {props,notes,calls,render,get nodes(){return nodes;},panel:()=>nodes.find(n=>n.type==='details'),controls:()=>nodes.find(n=>n.props?.freePlay),keys:()=>nodes.find(n=>typeof n.props?.onNote==='function')};
}
test('Piano starts collapsed, lazily shares game controls/audio and retains naming/free-play settings across closing',t=>{
 const page=mount(t);assert.equal(page.panel().props.open,false);assert.equal(page.keys(),undefined);
 page.panel().props.onToggle({currentTarget:{open:true}});page.render();const controls=page.controls();assert.equal(controls.props.allowInstrumentChange,false);assert.equal(controls.props.audio,page.props.audio);assert.equal(page.keys().props.startNote,page.props.audio.startNote);assert.equal(page.keys().props.octaveNavigation,true);assert.equal(controls.props.naming,'letters');assert.equal(controls.props.freePlay.enabled,false);
 page.keys().props.onNote(61);assert.deepEqual(page.notes,[61]);controls.props.onNaming('solfege');page.render();assert.equal(page.keys().props.naming,'solfege');page.controls().props.freePlay.onToggle();page.render();page.keys().props.onNote(64);assert.deepEqual(page.notes,[61]);assert.equal(page.calls.length,1);
 page.panel().props.onToggle({currentTarget:{open:false}});page.render();assert.equal(page.keys(),undefined);assert.equal(page.calls.length,2);page.panel().props.onToggle({currentTarget:{open:true}});page.render();assert.equal(page.controls().props.freePlay.enabled,true);assert.equal(page.keys().props.naming,'solfege');
});
test('dirty/readonly locks permit audition without invoking score edits',t=>{
 const page=mount(t);page.panel().props.onToggle({currentTarget:{open:true}});page.render();page.props.locked=true;page.render();page.keys().props.onNote(60);assert.deepEqual(page.notes,[]);assert.equal(page.keys().props.startNote,page.props.audio.startNote);assert.ok(page.nodes.some(n=>n.props?.role==='status'&&JSON.stringify(n.props.children).includes('locked')));
});
test('piano entry writes exact MIDI notes, advances the caret, preserves rhythm and uses one Undo per key',()=>{
 let state=s.emptyScore();state=s.scoreReducer(state,{type:'entry-accidental',value:-1});state=s.scoreReducer(state,{type:'tool',duration:'eighth'});state=s.scoreReducer(state,{type:'entry-dot',value:true});state=s.scoreReducer(state,{type:'entry-kind',value:'rest'});const before=state.score;
 state=s.scoreReducer(state,{type:'piano-note',midi:61,id:'piano-1'});assert.equal(state.entryKind,'note');assert.equal(state.score.staffs[0].events[0].midi,61);assert.equal(state.score.staffs[0].events[0].duration,'eighth');assert.equal(state.score.staffs[0].events[0].dotted,true);assert.equal(state.tick,m.NOTE_TICKS.eighth*1.5);assert.equal(state.past.length,1);
 const first=state.score;state=s.scoreReducer(state,{type:'piano-note',midi:60,id:'piano-2'});assert.equal(state.score.staffs[0].events.find(e=>e.id==='piano-2').midi,60);assert.equal(state.past.length,2);state=s.scoreReducer(state,{type:'undo'});assert.equal(state.score,first);state=s.scoreReducer(state,{type:'undo'});assert.equal(state.score,before);
});
test('Edit piano input replaces a selected chord member or rest on its actual staff without shifting time',()=>{
 let state=s.scoreReducer(s.emptyScore(),{type:'apply',seed:'piano',value:{bpm:120,key:'C',staffs:[{id:'a',clef:'treble',steps:[{midi:60,pitches:[60,64],duration:'whole'}]},{id:'b',clef:'bass',steps:[{midi:null,duration:'whole'}]}]}});
 state=s.scoreReducer(state,{type:'mode',mode:'edit'});const first=state.score.staffs[0].events[0];state=s.scoreReducer(state,{type:'select',staffId:'a',eventId:first.id,toneId:m.eventTones(first)[1].id});state=s.scoreReducer(state,{type:'piano-note',midi:66,id:'unused'});assert.deepEqual(m.eventTones(state.score.staffs[0].events[0]).map(t=>m.pitchMidi(t.spelling)),[60,66]);
 const rest=state.score.staffs[1].events[0];state=s.scoreReducer(state,{type:'select',staffId:'b',eventId:rest.id});const before=state.score;state=s.scoreReducer(state,{type:'piano-note',midi:43,id:'unused'});assert.equal(state.score.staffs[1].events[0].midi,43);assert.equal(m.totalTicks(state.score.staffs[1].events),m.MEASURE_TICKS);assert.equal(s.scoreReducer(state,{type:'undo'}).score,before);
});
test('piano replacements reject group selections, missing targets and stale commands atomically',()=>{
 let state=s.emptyScore();state=s.scoreReducer(state,{type:'piano-note',midi:60,id:'a'});state=s.scoreReducer(state,{type:'piano-note',midi:64,id:'b'});state=s.scoreReducer(state,{type:'mode',mode:'edit'});
 const before=state.score;assert.equal(s.scoreReducer(state,{type:'piano-note',midi:65,id:'x'}).score,before);
 for(const event of state.score.staffs[0].events.filter(e=>e.midi!==null))state=s.scoreReducer(state,{type:'select',staffId:'staff-1',eventId:event.id,toneId:m.eventTones(event)[0].id,toggle:true});
 assert.equal(state.selection.length,2);assert.equal(s.scoreReducer(state,{type:'piano-note',midi:67,id:'x'}).score,before);assert.equal(s.scoreReducer(state,{type:'piano-note',midi:67,id:'x',revision:state.revision-1}),state);
});


test('piano edits cannot collide with another tone and fill tuplet rests without changing their written values',()=>{
 let state=s.scoreReducer(s.emptyScore(),{type:'apply',seed:'piano',value:{bpm:120,key:'C',staffs:[{id:'a',clef:'treble',steps:[{midi:60,pitches:[60,64],duration:'whole'}]}]}});
 state=s.scoreReducer(state,{type:'mode',mode:'edit'});const chord=state.score.staffs[0].events[0];state=s.scoreReducer(state,{type:'select',staffId:'a',eventId:chord.id,toneId:m.eventTones(chord)[1].id});assert.equal(s.scoreReducer(state,{type:'piano-note',midi:60,id:'x'}).score,state.score);
 state=s.emptyScore();state=s.scoreReducer(state,{type:'mode',mode:'edit'});const rest=state.score.staffs[0].events[0];state=s.scoreReducer(state,{type:'select',staffId:'staff-1',eventId:rest.id});state=s.scoreReducer(state,{type:'apply-tuplet',staffId:'staff-1',eventId:rest.id,count:3,duration:'eighth',id:'group'});
 const selected=state.rest,event=state.score.staffs[0].events.find(item=>item.id===selected.eventId),before=state.score;state=s.scoreReducer(state,{type:'piano-note',midi:66,id:'x'});const filled=state.score.staffs[0].events.find(item=>item.id===event.id);assert.equal(filled.midi,66);assert.deepEqual(filled.tuplet,event.tuplet);assert.equal(m.totalTicks(state.score.staffs[0].events),m.MEASURE_TICKS);assert.equal(s.scoreReducer(state,{type:'undo'}).score,before);
});
