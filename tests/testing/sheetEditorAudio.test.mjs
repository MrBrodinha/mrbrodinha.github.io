import assert from 'node:assert/strict';
import test from 'node:test';
import { hookHostUrl, moduleUrl, sourceUrl, musicUrl, victoryUrl } from './sheetEditorModules.mjs';

// Exercise the shared hook behind entry auditions, including delayed
// sampler readiness. This adapter never downloads samples or opens audio devices.
const hostUrl=hookHostUrl('sheet entry audio'),host=await import(hostUrl);
const soundsUrl=moduleUrl(`export const fixture={instrument:null};
 export const defaultPianoSound=()=> 'grand';export const PIANO_SOUNDS={grand:'Grand piano'};
 export const createSampledPiano=async()=>fixture.instrument;`);
const {fixture}=await import(soundsUrl);
const {usePianoAudio}=await import(await sourceUrl('src/components/brodle/hooks/usePianoAudio.ts',{
 react:hostUrl,'../lib/musicGame':musicUrl,'../lib/victoryMusic':victoryUrl,'../lib/pianoSounds':soundsUrl,
}));
function mount(t){
 t.mock.timers.enable({apis:['setTimeout']});host.reset();
 const starts=[],stops=[],contexts=[];let resolve,reject,disposed=0;
 fixture.instrument={ready:new Promise((yes,no)=>{resolve=yes;reject=no;}),dispose:()=>disposed++,start:options=>{starts.push(options);return at=>stops.push(at);}};
 const parameter=()=>({value:0,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}});
 const node=()=>({connect(){},disconnect(){}});
 class AudioContext{
  state='running';currentTime=0;destination=node();oscillators=[];
  constructor(){contexts.push(this);}
  createGain(){return {...node(),gain:parameter()};}
  createOscillator(){const voice={...node(),frequency:parameter(),start(){},stop(){}};this.oscillators.push(voice);return voice;}
  async resume(){this.state='running';}async close(){this.state='closed';}
 }
 const globals={AudioContext,window:new EventTarget(),document:Object.assign(new EventTarget(),{hidden:false})};
 const originals=new Map(Object.keys(globals).map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 for(const [name,value] of Object.entries(globals))Object.defineProperty(globalThis,name,{configurable:true,value});
 t.after(()=>{host.reset();for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
 const render=()=>{host.begin();const audio=usePianoAudio([],120);host.flush();return audio;};
 return {audio:render(),render,starts,stops,contexts,resolve:()=>resolve(),reject:()=>reject(new Error('Offline')),disposed:()=>disposed};
}
const preview=(midi,pitches)=>[{midi,beats:1,...(pitches?{pitches}:{})}];
test('rapid entry auditions waiting for a sampler play only the newest accepted chord',async t=>{
 const f=mount(t),first=f.audio.playMelody(preview(60),'testing-sheet-editor-entry',120),last=f.audio.playMelody(preview(64,[64,67]),'testing-sheet-editor-entry',120);
 f.resolve();await Promise.all([first,last]);assert.deepEqual(f.starts.map(note=>note.note),[64,67]);
 assert.equal(f.starts[0].time,f.starts[1].time);assert.equal(f.starts[0].duration,.45);
 f.audio.stopAudio();assert.equal(f.stops.length,2);assert.equal(f.render().playing,null);
});
for(const cancellation of ['stop','unmount'])test(`${cancellation} cancels a pending sampled entry without late notes`,async t=>{
 const f=mount(t),pending=f.audio.playMelody(preview(60),'testing-sheet-editor-entry',120);
 if(cancellation==='stop')f.audio.stopAudio();else host.reset();
 f.resolve();await pending;assert.equal(f.starts.length,0);
 if(cancellation==='unmount')assert.equal(f.contexts[0].state,'closed');
});
test('a failed sampler falls back to synth for this accepted entry and remains editable',async t=>{
 const f=mount(t),pending=f.audio.playMelody(preview(60),'testing-sheet-editor-entry',120);f.reject();await pending;
 assert.equal(f.starts.length,0);assert.equal(f.contexts[0].oscillators.length,1);const audio=f.render();
 assert.equal(audio.usingSynthFallback,true);assert.match(audio.audioError,/could not load/);
 await audio.playMelody(preview(62),'testing-sheet-editor-entry',120);assert.equal(f.contexts[0].oscillators.length,2);
 audio.stopAudio();
});

test('newer precise timeline/Stop cancels older delayed sampler voices and preserves full sustain',async t=>{
 const f=mount(t),old=f.audio.playTimeline({totalDuration:1,events:[{midi:60,time:0,duration:1,sustain:true}]},'old');
 const current=f.audio.playTimeline({totalDuration:1,events:[{midi:64,time:0,duration:1,sustain:true},{midi:67,time:.12,duration:.88,sustain:true}]},'new');
 f.resolve();await Promise.all([old,current]);assert.deepEqual(f.starts.map(n=>n.note),[64,67]);assert.deepEqual(f.starts.map(n=>n.duration),[1,.88]);f.audio.stopAudio();assert.equal(f.stops.length,2);
});

test('unmount cancels delayed precise arpeggio/tied timelines before any sound',async t=>{
 const f=mount(t),pending=f.audio.playTimeline({totalDuration:1,events:[{midi:60,time:.12,duration:.88,sustain:true},{midi:64,time:0,duration:1,sustain:true}]},'pending');host.reset();f.resolve();await pending;assert.equal(f.starts.length,0);assert.equal(f.contexts[0].oscillators.length,0);
});

test('accepted timeline snapshots cannot be changed while waiting for a sampler',async t=>{
 const f=mount(t),timeline={totalDuration:1,events:[{midi:60,time:0,duration:1,sustain:true}]};const pending=f.audio.playTimeline(timeline,'snapshot');timeline.events[0].midi=99;timeline.events[0].time=.5;f.resolve();await pending;assert.equal(f.starts[0].note,60);assert.equal(f.starts[0].time,.03);
});
