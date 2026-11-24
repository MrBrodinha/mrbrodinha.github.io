import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { model as m, sheetEditorCode, codeSnapshot, parseSheetCode, linkedDraftRange } from './sheetEditorModules.mjs';
const units=value=>value*420;
function exportedSteps(code){
 const source=ts.createSourceFile('score.ts',code,ts.ScriptTarget.ES2020,true);
 const statement=source.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations[0].name.getText(source)==='MELODY');
 return statement.declarationList.declarations[0].initializer.elements.map(e=>JSON.parse(e.getText(source)));
}
test('generated code type-checks with its own chord-capable type and equals complete playback data',()=>{
 let state=m.editorReducer(m.emptyEditor(),{type:'fill',tick:units(2),pitch:60,id:'c'});state=m.editorReducer(state,{type:'add-tone',id:'c',pitch:64,toneId:'e'});
 const code=sheetEditorCode(state.events);assert.deepEqual(exportedSteps(code),m.scoreSteps(state.events));assert.ok(!code.includes('__pending'));assert.ok(!code.includes('y0'));assert.ok(!code.includes('initial:'));
 const file='/tmp/generated-sheet-score.ts',options={target:ts.ScriptTarget.ES2020,noEmit:true,strict:true,skipLibCheck:true};
 const host=ts.createCompilerHost(options),original=host.getSourceFile;
 host.getSourceFile=(name,...args)=>name===file?ts.createSourceFile(file,code,options.target,true):original(name,...args);
 const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram([file],options,host));assert.deepEqual(diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
});
test('code includes initial/reset silence and only committed musical changes; selection/modes do not affect it',()=>{
 let state=m.emptyEditor(),code=sheetEditorCode(state.events);assert.equal(exportedSteps(code).reduce((sum,p)=>sum+p.beats,0),4);
 m.tentativeOperation(state.events,{kind:'fill',tick:units(2),pitch:60},{duration:'sixteenth',accidental:0});assert.equal(sheetEditorCode(state.events),code);
 state=m.editorReducer(state,{type:'mode',mode:'edit'});state=m.editorReducer(state,{type:'select',id:state.events[0].id});assert.equal(sheetEditorCode(state.events),code);
 state=m.editorReducer(state,{type:'mode',mode:'place'});state=m.editorReducer(state,{type:'fill',tick:units(0),pitch:64,id:'e'});assert.notEqual(sheetEditorCode(state.events),code);state=m.editorReducer(state,{type:'undo'});assert.equal(sheetEditorCode(state.events),code);
});

const documentFor = steps => `const BPM=120; const KEY='C'; const TIME_SIGNATURE='4/4'; const MELODY: ScoreStep[]=${JSON.stringify(steps)};`;
test('bounded literal parser round-trips generated rests, offbeats, chords and multiple measures with real source ranges',()=>{
 let state=m.editorReducer(m.emptyEditor(),{type:'tool',duration:'sixteenth'});
 state=m.editorReducer(state,{type:'fill',tick:units(2),pitch:62,id:'d'});
 state=m.editorReducer(state,{type:'add-tone',id:'d',pitch:65,toneId:'f'});
 state=m.editorReducer(state,{type:'add-measure'});
 const snapshot=codeSnapshot(state.events),parsed=parseSheetCode(snapshot.code);
 assert.deepEqual(parsed.steps,m.scoreSteps(state.events).map(({midi,pitches,beats})=>({midi,...(pitches?{pitches}:{}),beats})));
 state.events.forEach((event,i)=>{
   const range=snapshot.ranges[event.id];assert.deepEqual(range,parsed.ranges[i]);
   assert.deepEqual(JSON.parse(snapshot.code.slice(range.start,range.end)),m.scoreSteps([event])[0]);
   assert.equal(range.startLine,snapshot.code.slice(0,range.start).split('\n').length);
   assert.deepEqual(linkedDraftRange(parsed,state.events,event.id),range);
 });
});
test('literal source ranges follow comments, strings, blanks, trailing commas and multiline chord objects',()=>{
 const text=`// score\n\nconst BPM=120; /* unchanged */\nconst KEY='C';\nconst TIME_SIGNATURE='4/4';\nconst MELODY = [\n  {\n    midi:60, pitches: [60,64,],\n    beats:4, length:'/* literal */', rhythm:'a\\\'b',\n  },\n]; // end`;
 const parsed=parseSheetCode(text),range=parsed.ranges[0];assert.deepEqual(parsed.steps,[{midi:60,pitches:[60,64],beats:4}]);
 assert.equal(range.startLine,7);assert.equal(range.endLine,10);assert.equal(text.slice(range.start,range.end).at(-1),'}');
 const events=m.importedScore([],parsed.steps,'new');assert.deepEqual(linkedDraftRange(parsed,events,events[0].id),range);
 const canonical=sheetEditorCode(events);assert.ok(!canonical.includes('literal'));assert.ok(!canonical.includes('a\\\'b'));assert.deepEqual(exportedSteps(canonical),m.scoreSteps(events));
});
test('dirty linkage follows semantic onset/duration/pitches, never an array index or changed music',()=>{
 let state=m.editorReducer(m.emptyEditor(),{type:'fill',tick:units(4),pitch:64,id:'e'});
 const base=sheetEditorCode(state.events),shifted=parseSheetCode('\n// comment\n'+base);
 assert.equal(linkedDraftRange(shifted,state.events,'e').startLine,codeSnapshot(state.events).ranges.e.startLine+2);
 const changed=parseSheetCode(base.replace('"midi":64','"midi":65'));assert.equal(linkedDraftRange(changed,state.events,'e'),null);
 const moved=parseSheetCode(documentFor([{midi:64,beats:1},{midi:null,beats:1},{midi:null,beats:2}]));assert.equal(linkedDraftRange(moved,state.events,'e'),null);
 const longer=parseSheetCode(documentFor([{midi:null,beats:1},{midi:64,beats:2},{midi:null,beats:1}]));assert.equal(linkedDraftRange(longer,state.events,'e'),null);
 assert.equal(linkedDraftRange(shifted,state.events,'missing'),null);
});
test('parser rejects malformed, executable, duplicate and unsupported input without executing anything',()=>{
 globalThis.__sheetCodeExecuted=0;
 const valid=documentFor([{midi:60,beats:4}]);
 const bad=[
   valid+';globalThis.__sheetCodeExecuted=1',valid.replace('"midi":60','"midi":(globalThis.__sheetCodeExecuted=1)'),
   valid.replace('120','120+0'),valid+' const BPM=120;',valid+' const OTHER=1;',valid.replace('"midi":60','"midi":60,"midi":62'),
   valid.replace('"midi":60','"midi":60,"unknown":1'),valid.replace('"midi":60','"__proto__":60'),
   valid.replace('120','401'),valid.replace("KEY='C'","KEY='H'"),valid.replace("'4/4'","'3/4'"),
   valid.replace('"beats":4','"beats":1e999'),valid.replace('"beats":4','"beats":null'),valid.replace('"beats":4','"beats":-1'),
   valid.replace('"beats":4','"beats":0.125'),valid.replace('"midi":60','"midi":-1'),valid.replace('"midi":60','"midi":84.5'),
   documentFor([]),documentFor([{midi:60,beats:1}]),documentFor([{midi:60,beats:1},{midi:62,beats:4},{midi:null,beats:1},{midi:null,beats:1}]),
   ...[null,[],[60],[60,60],[64,60],[60,128],[60,61,62,63,64,65,66,67,68]].map(pitches=>documentFor([{midi:60,pitches,beats:4}])),
   documentFor([{midi:null,pitches:[60,64],beats:4}]),documentFor([{midi:64,pitches:[60,64],beats:4}]),
   documentFor([{midi:60,beats:4,length:1}]),documentFor(Array.from({length:65},()=>({midi:60,beats:4}))),
   documentFor(Array.from({length:17},()=>({midi:null,beats:4}))), // 68 normalized quarter rests
   valid+' /* unterminated', valid.replace("'C'","'\\u0043'"),
   ' '.repeat(250001),valid.replace('const BPM','let BPM'),valid.replace('const BPM=120;',''),
   'type ScoreStep = { anything: number };'+valid,
   valid.replace('"midi":60','"midi":fetch("https://example.invalid")'),
 ];
 for(const text of bad)assert.throws(()=>parseSheetCode(text),/line \d+/,'Expected rejection: '+text.slice(0,140));
 assert.equal(globalThis.__sheetCodeExecuted,0);delete globalThis.__sheetCodeExecuted;
});
test('parser enforces normalized event cap, accepts boundary pitches and reports offending physical line',()=>{
 const max=Array.from({length:64},()=>({midi:null,beats:1}));assert.equal(parseSheetCode(documentFor(max)).steps.length,64);
 assert.deepEqual(parseSheetCode(documentFor([{midi:60,pitches:[60,61,62,63,64,65,66,84],beats:4}])).steps[0].pitches,[60,61,62,63,64,65,66,84]);
 assert.throws(()=>parseSheetCode('\n\n'+documentFor([{midi:128,beats:4}])),/line 3/);
});
