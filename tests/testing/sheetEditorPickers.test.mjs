import assert from 'node:assert/strict';
import test from 'node:test';
import abcjs from 'abcjs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { model as m,scoreModel as s,notation,playback,parseSheetCode,codeUrl,previewUrl,modelUrl,sourceUrl,moduleUrl,hookHostUrl,flatten } from './sheetEditorModules.mjs';
const {scoreCodeSnapshot,LEGACY_SCORE_STAFF_TYPE,LEGACY_RICH_SCORE_STAFF_TYPE}=await import(codeUrl);
const {propertyPreviewAbc,keyDescription}=await import(previewUrl);

test('all four clefs have correct line anchors, pointer bounds and ABC C-clef positions',()=>{
 const geometry={left:0,right:200,bottom:200,step:5};
 for(const [clef,bottomMidi,minimum,position] of [['treble',64,53,4],['bass',43,29,8],['alto',53,43,6],['tenor',50,40,8]]){
  assert.deepEqual(m.CLEFS[clef],{label:clef[0].toUpperCase()+clef.slice(1),bottomMidi,minimum});
  assert.equal(m.staffPitch({x:100,y:200},geometry,bottomMidi,minimum),bottomMidi);
  assert.equal(m.staffPitch({x:100,y:m.pitchY(minimum,geometry,bottomMidi)},geometry,bottomMidi,minimum),minimum);
  const tune=abcjs.parseOnly(propertyPreviewAbc(clef))[0];assert.equal(tune.warnings,undefined);assert.equal(tune.lines.find(line=>line.staff).staff[0].clef.clefPos,position);
 }
});

test('clef changes preserve pitches/timelines, are scoped and undoable, with safe legacy/new code declarations',()=>{
 let state=s.scoreReducer(s.emptyScore(),{type:'part',action:{type:'fill',tick:0,pitch:60,id:'c'}});
 state=s.scoreReducer(state,{type:'add-staff',id:'second',clef:'bass'});const before=state.score,first=before.staffs[0],timeline=playback.performanceTimeline(before);
 for(const clef of Object.keys(m.CLEFS)){
  const changed=s.scoreReducer(state,{type:'clef',staffId:'second',value:clef});assert.equal(changed.score.staffs[0],first);assert.deepEqual(playback.performanceTimeline(changed.score),timeline);
  const snapshot=scoreCodeSnapshot(changed.score),parsed=parseSheetCode(snapshot.code);assert.equal(parsed.staffs[1].clef,clef);assert.equal(s.scoreReducer(changed,{type:'apply',value:parsed,seed:'same'}),changed);
  assert.ok(notation.scoreNotation(changed.score).abc.includes(`clef=${clef}`));
  if(clef!=='bass')assert.equal(s.scoreReducer(changed,{type:'undo'}).score,before);
 }
 const legacy=snapshotLegacy(state.score);assert.equal(parseSheetCode(legacy).staffs[1].clef,'bass');
 for(const declaration of [LEGACY_SCORE_STAFF_TYPE,LEGACY_RICH_SCORE_STAFF_TYPE]){
  const text=`${declaration}\nconst BPM=120;const KEY='C';const TIME_SIGNATURE='4/4';const STAVES: ScoreStaff[]=[{id:'a',clef:'treble',steps:[{midi:60,beats:4}]}];`;
  assert.equal(parseSheetCode(text).staffs[0].clef,'treble');
 }
 assert.throws(()=>parseSheetCode(legacy.replace('"bass"','"perc"')));assert.throws(()=>parseSheetCode(legacy+'globalThis.bad=1;'));
});
function snapshotLegacy(score){return scoreCodeSnapshot(score).code.replace("'treble' | 'bass' | 'alto' | 'tenor'","'treble' | 'bass'");}

test('key preview text and actual ABC agree on ordered sharps/flats across new clefs',()=>{
 for(const [key,expected,count] of [['C','No accidentals',0],['Am','No accidentals',0],['G','1 sharp: F♯',1],['D','2 sharps: F♯, C♯',2],['F','1 flat: B♭',1],['Bb','2 flats: B♭, E♭',2],['C#','7 sharps: F♯, C♯, G♯, D♯, A♯, E♯, B♯',7],['Cb','7 flats: B♭, E♭, A♭, D♭, G♭, C♭, F♭',7]]){
  assert.equal(keyDescription(key),expected);
  for(const clef of ['alto','tenor']){const tune=abcjs.parseOnly(propertyPreviewAbc(clef,key))[0];assert.equal(tune.warnings,undefined);const staff=tune.lines.find(line=>line.staff).staff[0];assert.equal(staff.key.accidentals.length,count);}
 }
});

const previewStub=moduleUrl('export default function Preview(){}');
const {default:ClefChoices}=await import(await sourceUrl('src/components/testing/sheet-editor/ClefChoices.tsx',{'./sheetEditorModel':modelUrl,'./NotationPreview':previewStub}));
test('clef cards provide native named radio choices with current selection',()=>{
 const html=renderToStaticMarkup(React.createElement(ClefChoices,{value:'tenor',onChange(){},'aria-label':'Staff clef'}));
 assert.equal((html.match(/type="radio"/g)??[]).length,4);assert.match(html,/checked="" value="tenor"/);
 for(const label of ['Treble','Bass','Alto','Tenor'])assert.ok(html.includes(label));assert.ok(html.includes('<fieldset'));assert.ok(html.includes('<legend>Staff clef'));
});

const hostUrl=hookHostUrl('notation preview'),host=await import(hostUrl);
const rendererUrl=moduleUrl('export const fixture={calls:[],fail:false};export default {renderAbc(element,abc,options){fixture.calls.push([abc,options]);if(fixture.fail)throw new Error("Preview error");}};');
const {fixture}=await import(rendererUrl);
const {default:NotationPreview}=await import(await sourceUrl('src/components/testing/sheet-editor/NotationPreview.tsx',{react:hostUrl,abcjs:rendererUrl,'./sheetEditorModel':modelUrl,'./sheetEditorPreview':previewUrl}));
test('read-only previews update from draft props and recover gracefully from renderer failure',t=>{
 host.reset();fixture.calls=[];fixture.fail=false;t.after(()=>host.reset());
 const attrs={},element={querySelector:()=>({setAttribute:(key,value)=>attrs[key]=value}),replaceChildren(){}};
 let props={clef:'alto',musicalKey:'D'},nodes;
 const render=()=>{for(let i=0;i<5;i++){host.begin();nodes=flatten(NotationPreview(props));nodes.find(node=>node.ref).ref.current=element;host.flush();if(!host.dirty)return;}assert.fail('Preview did not settle');};
 render();assert.equal(fixture.calls.length,1);assert.equal(attrs['aria-hidden'],'true');assert.ok(fixture.calls[0][0].includes('K:D clef=alto'));
 assert.equal(fixture.calls[0][1].clickListener,undefined);
 props={clef:'tenor',musicalKey:'Bb'};render();assert.equal(fixture.calls.length,2);assert.ok(fixture.calls[1][0].includes('K:Bb clef=tenor'));
 fixture.fail=true;props={clef:'bass',musicalKey:'C'};render();assert.ok(nodes.some(node=>node.props?.className==='studio-preview-fallback'));
 fixture.fail=false;props={clef:'treble',musicalKey:'G'};render();assert.equal(nodes.some(node=>node.props?.className==='studio-preview-fallback'),false);
});
