import assert from 'node:assert/strict';
import test from 'node:test';
import abcjs from 'abcjs';
import { createElement } from 'react';
import { setTimeout } from 'node:timers/promises';
import { playbackUrl,rhythmUrl,codeUrl as expressionCodeUrl,scoreUrl, musicUrl, flatten, hookHostUrl, modelUrl, moduleUrl, notationUrl, layoutUrl, sourceUrl, model } from './sheetEditorModules.mjs';
const units=value=>value*420;

const hostUrl = hookHostUrl('editable staff');
const host = await import(hostUrl);
const rendererUrl = moduleUrl('export const fixture = { render: null }; export default { renderAbc(...args) { return fixture.render(...args); } };');
const { fixture: renderer } = await import(rendererUrl);
const { default: EditableStaff } = await import(await sourceUrl('src/components/testing/sheet-editor/EditableStaff.tsx', {
  react: hostUrl, abcjs: rendererUrl, '../../brodle/components/RhythmSymbol': await sourceUrl('src/components/brodle/components/RhythmSymbol.tsx'), './sheetEditorModel': modelUrl, './scoreModel':scoreUrl, './sheetEditorRhythm':rhythmUrl, './sheetEditorPlayback':playbackUrl, '../../brodle/lib/musicGame':musicUrl, './sheetEditorNotation': notationUrl, './sheetEditorLayout': layoutUrl, './sheetEditorCode':expressionCodeUrl,
}));

let failScreenRects=false;
function element(box = { left: 0, right: 640, top: 0, bottom: 260 }) {
  return {
    dataset: {}, style: {}, attributes: {}, children: [], classes: new Set(),
    closest() { return this; },
    remove() {if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);},
    get childNodes() { return this.children; },
    getBBox:()=>({x:box.left,y:box.top,width:box.right-box.left,height:box.bottom-box.top}),
    getCTM:()=>({a:1,b:0,c:0,d:1,e:0,f:0,inverse:()=>({multiply:()=>({a:1,b:0,c:0,d:1,e:0,f:0})})}),
    getBoundingClientRect() { if(failScreenRects&&!this.isSvg)throw new Error('Screen SVG bounds unavailable');return { ...box, width: box.right - box.left, height: box.bottom - box.top }; },
    setAttribute(name, value) { this.attributes[name] = value; },
    append(child) { child.parent=this;this.children.push(child); }, replaceChildren(...children) { this.children = children; },
    querySelector() { return this.children.find(child => child.isSvg) ?? null; },
    querySelectorAll(selector) { return this.querySelector()?.querySelectorAll(selector) ?? []; },
    get classList() { return { toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name) }; },
  };
}
function mount(t, changes = {}, fragments = [], options = {}) {
  failScreenRects=options.screenRects===false;
  host.reset();
  const calls = [];
  let inverse = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  let valid = options.ready!==false, renders = 0, disconnected = 0, resize, nextFrame = 0, engravingOptions;
  const frames = new Map();
  const canvas = element(), preview = element(), surface = element();
  const viewport = Object.assign(element(), { clientWidth: options.width ?? 600, scrollLeft: 0, focus: () => calls.push(['focus']) });
  const listeners = new Map();
  const globals = {
    document: { createElementNS: () => element() },
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} disconnect() { disconnected++; } },
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  const originals = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
  renderer.render = (target, abc, config) => {
    engravingOptions=config;
    renders++;
    target.style.position = 'relative'; // abcjs responsive-container behavior
    const voices=abcjs.parseOnly(abc)[0].lines.filter(line=>line.staff).flatMap(line=>line.staff.map(staff=>staff.voices.flat()));
    const parsed=voices.flatMap((voice,row)=>voice.filter(note=>note.el_type==='note'&&(!note.rest||!['spacer','invisible'].includes(note.rest.type))).map(note=>({...note,row})));
    const count=parsed.length;
    const notes=Array.from({length:count},(_,i)=>{
      const row=parsed[i].row,local=parsed.slice(0,i).filter(note=>note.row===row).length,n=parsed.filter(note=>note.row===row).length;
      const gap=Math.min(90,365/Math.max(1,n-1));
      const [left,right]=target===canvas&&fragments[i]?fragments[i]:[170+local*gap,180+local*gap];
      const node=element({left,right,top:110+row*260,bottom:145+row*260});
      node.heads=(parsed[i].pitches??[]).map(()=>element());node.querySelectorAll=selector=>selector==='.abcjs-notehead'?node.heads:[];return node;
    });
    const rows=voices.map((_,row)=>({querySelectorAll:()=>[100,110,120,130,140].map(y=>element({left:20,right:600,top:y+row*260-.2,bottom:y+row*260+.2}))}));
    const headers=voices.map((_,row)=>element({left:25,right:80,top:95+row*260,bottom:145+row*260}));
    const markingNodes=options.markings ? ['clef','key-signature','time-signature','tempo'].flatMap((kind,index)=>voices.map((_,row)=>{const node=element({left:65+index*20,right:80+index*20,top:100+row*260,bottom:140+row*260});node.matches=selector=>selector===`g.abcjs-${kind}`;if(options.brokenMarkings)node.getBBox=()=>{throw new Error('Missing marking transform');};return node;})) : [];
    const svg=Object.assign(element(),{
      isSvg:true,notes,viewBox:{baseVal:{x:0,y:0,width:options.markings?Number.parseFloat(target.style.width):640,height:voices.length*260}},getScreenCTM:()=>({inverse:()=>inverse}),
      querySelectorAll:selector=>options.markings&&['g.abcjs-clef','g.abcjs-key-signature','g.abcjs-time-signature','g.abcjs-tempo'].includes(selector)?markingNodes.filter(node=>node.matches(selector)):selector==='g.abcjs-staff'?valid?rows:[]:selector==='g.abcjs-staff-extra'?headers:selector==='.sheet-editor-tone-selection'?svg.children.filter(n=>n.attributes?.class==='sheet-editor-tone-selection'):selector==='g.abcjs-bar'?voices.map((_,row)=>element({left:550,right:553,top:100+row*260,bottom:140+row*260})):notes,
    });
    target.replaceChildren(svg);
    return [{getSelectableArray:()=>notes.map((note,i)=>({svgEl:note,absEl:{notePositions:(parsed[i].pitches??[]).map((pitch,j)=>({x:(note.getBBox().x+note.getBBox().width/2)+(j&&pitch.pitch===parsed[i].pitches[j-1].pitch+1?8:0),y:150+parsed[i].row*260-(pitch.verticalPos??pitch.pitch)*5}))}}))}];
  };
  t.after(() => { host.reset();failScreenRects=false; for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  const props = {
    mode:'place', modeVersion:0, targetId:null, onClearSelection:()=>calls.push(['clear-selection']),
    revision:0, events: model.initialEvents(), selectedId: null, caret: { tick: units(0), pitch: 64 }, duration:'quarter', accidental:0,
    onPlace: point => calls.push(['place', point]), onCaret: point => calls.push(['caret', point]),
    onAddTone: command => calls.push(['add-tone',command]),
    onSelect: id => calls.push(['select', id]), onDelete: id => calls.push(['delete', id]), onUndo: () => calls.push(['undo']), onTranspose: delta=>calls.push(['transpose',delta]),
    ...changes,
  };
  let nodes, root;
  function render() {
    for (let count = 0; count < 8; count++) {
      host.begin(); nodes = flatten(EditableStaff(props));
      root = nodes.find(node => node.props?.className === 'sheet-editor-scroll'); root.ref.current = viewport;
      nodes.find(node => node.props?.className === 'sheet-editor-canvas').ref.current = canvas;
      nodes.find(node => node.props?.className === 'sheet-editor-canvas sheet-editor-preview').ref.current = preview;
      nodes.find(node => node.props?.className === 'sheet-editor-surface').ref.current = surface;
      host.flush();
      if (!host.dirty) return root.props;
    }
    assert.fail('Staff did not settle');
  }
  render();
  const event = (changes = {}) => ({ clientX: 200, clientY: 140, button: 0, isPrimary: true, pointerId: 1, pointerType: 'mouse', currentTarget: viewport, target: element(), ...changes });
  return { calls, props, event, render, root: () => root.props, nodes: () => nodes, get notes(){return canvas.querySelector().notes;}, viewport, canvas, preview, listeners,
    renders: () => renders, disconnected: () => disconnected, engravingOptions: () => engravingOptions,
    frames:()=> {const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());},
    inverse: matrix => { inverse = matrix; }, valid: value => { valid = value; }, resize: () => resize(),
  };
}


const finalSystemCenter=(staff,count=staff.props.score?.staffs.length??1)=>{
 const rows=[...new Set(staff.notes.map(note=>note.getBBox().y))].sort((a,b)=>a-b);
 return ((rows.at(-count)+rows.at(-1))/2+10)*(staff.props.zoom??1);
};
const tap=(staff,x=175,y=140,type='mouse')=>{const e=staff.event({clientX:x,clientY:y,pointerType:type});staff.root().onPointerDown(e);staff.root().onPointerUp(e);};
const key=(staff,value,extra={})=>staff.root().onKeyDown({key:value,target:staff.viewport,currentTarget:staff.viewport,preventDefault(){},stopPropagation(){},...extra});
test('later systems use local targets and cancel held gestures on layout-only changes',t=>{
 let state=model.emptyEditor();for(let i=0;i<4;i++)state=model.editorReducer(state,{type:'add-measure'});
 const staff=mount(t,{events:state.events});const guides=staff.nodes().filter(n=>n.props?.['data-tick']!==undefined);
 assert.ok(guides.some(n=>n.props['data-row']>0));
 const guide=guides.find(n=>n.props['data-row']===1),tick=guide.props['data-tick'],x=flatten(guide).find(n=>n.type==='line').props.x1;
 tap(staff,x,140+260);assert.deepEqual(staff.calls.find(c=>c[0]==='place'),['place',{tick,pitch:64}]);
 const e=staff.event({clientX:x,clientY:400});staff.root().onPointerDown(e);staff.viewport.clientWidth=580;staff.resize();staff.root().onPointerUp(e);
 assert.equal(staff.calls.filter(c=>c[0]==='place').length,1);
});
test('a pointer gesture after keyboard preview still clears its preview on page scroll',t=>{
 const staff=mount(t);staff.root().onFocus({target:staff.viewport,currentTarget:staff.viewport});staff.frames();assert.equal(staff.preview.style.display,'block');
 const event=staff.event({clientX:175});staff.root().onPointerDown(event);staff.listeners.get('scroll')();
 assert.equal(staff.preview.style.display,'none');staff.root().onPointerUp(event);assert.equal(staff.calls.some(c=>c[0]==='place'),false);
});
test('dirty locks cancel held previews/native requests, preserve selection and reject old epochs after unlock',t=>{
 const staff=mount(t,{interactionVersion:0});
 staff.root().onPointerMove(staff.event({clientX:220}));staff.frames();const held=staff.event({clientX:220});staff.root().onPointerDown(held);
 staff.props.locked=true;staff.props.interactionVersion=1;staff.render();staff.root().onPointerUp(held);key(staff,'Enter');key(staff,'Delete');key(staff,'ArrowUp');key(staff,'z',{ctrlKey:true});tap(staff,175);
 assert.equal(staff.calls.some(c=>['place','add-tone','delete','transpose','undo'].includes(c[0])),false);assert.ok(staff.calls.some(c=>c[0]==='select'));
 staff.props.locked=false;staff.props.interactionVersion=2;
 staff.props.requestedOperation={token:1,modeVersion:0,revision:0,interactionVersion:0,command:{kind:'fill',tick:units(0),pitch:64}};staff.render();staff.frames();staff.root().onPointerUp(held);
 assert.equal(staff.calls.some(c=>c[0]==='place'),false);
 staff.props.requestedOperation=null;staff.render();tap(staff,175);assert.equal(staff.calls.filter(c=>c[0]==='place').length,1);
 staff.props.mode='edit';staff.props.modeVersion=1;staff.props.locked=true;staff.render();
 const selected=staff.calls.filter(c=>c[0]==='select').length;key(staff,'ArrowRight');assert.equal(staff.calls.filter(c=>c[0]==='select').length,selected+1,'dirty code permits keyboard selection');
});
test('a rest column fills once, hover is pure/reused, and commit promotes the exact subdivided candidate SVG',t=>{
 const staff=mount(t,{duration:'sixteenth'});staff.root().onPointerMove(staff.event({clientX:220}));staff.frames();
 const shown=staff.preview.querySelector(),count=staff.renders();staff.root().onPointerMove(staff.event({clientX:220}));staff.frames();assert.equal(staff.renders(),count);
 assert.equal(staff.calls.some(c=>c[0]==='place'),false);tap(staff,220);assert.deepEqual(staff.calls.find(c=>c[0]==='place'),['place',{tick:units(2),pitch:64}]);
 staff.props.events=model.tentativeFill(staff.props.events,{tick:units(2),pitch:64},staff.props,'real');staff.props.revision++;staff.render();
 assert.equal(staff.canvas.querySelector(),shown);assert.equal(staff.renders(),count);assert.ok(shown.notes.some(n=>n.dataset.eventId==='real'));
});
test('direct rest glyph hits and offbeat touch targets fill the same integer times',t=>{
 const staff=mount(t,{duration:'eighth'});tap(staff,175);tap(staff,220,140,'touch');
 assert.deepEqual(staff.calls.filter(c=>c[0]==='place'),[['place',{tick:units(0),pitch:64}],['place',{tick:units(2),pitch:64}]]);
});
test('blank leading/trailing space, margins, right click, scroll, drag and cancellation do not fill',t=>{
 const staff=mount(t);for(const [x,y] of [[110,140],[580,140],[175,0]])tap(staff,x,y);
 let e=staff.event({clientX:175});staff.root().onPointerDown(e);staff.root().onScroll();staff.root().onPointerUp(e);
 staff.root().onPointerDown(e);staff.root().onPointerMove({...e,clientX:200});staff.root().onPointerUp(e);
 staff.root().onPointerDown(e);staff.root().onPointerCancel();staff.root().onPointerUp(e);
 e={...e,button:2};staff.root().onPointerDown(e);staff.root().onPointerUp(e);
 assert.equal(staff.calls.filter(c=>c[0]==='place').length,0);
});
test('Edit focus, hover, blank clicks, Enter and stale requests never place, while rests remain selectable',t=>{
 const staff=mount(t,{mode:'edit',modeVersion:1});staff.root().onFocus({target:staff.viewport,currentTarget:staff.viewport});staff.frames();tap(staff,175);tap(staff,220);key(staff,'Enter');
 staff.props.requestedOperation={token:1,modeVersion:0,revision:0,command:{kind:'fill',tick:units(0),pitch:64}};staff.render();
 assert.equal(staff.renders(),1);assert.equal(staff.calls.some(c=>c[0]==='place'||c[0]==='add-tone'),false);
 assert.ok(staff.calls.some(c=>c[0]==='select'));assert.ok(staff.calls.some(c=>c[0]==='clear-selection'));
});
test('rhythmic keyboard targets, mode-specific arrows, native exclusions, Escape and Undo share callbacks',t=>{
 const staff=mount(t,{duration:'sixteenth'});key(staff,'ArrowRight');assert.deepEqual(staff.calls.at(-1),['caret',{tick:units(1),pitch:64}]);
 key(staff,'ArrowUp');assert.deepEqual(staff.calls.at(-1),['caret',{tick:units(0),pitch:65}]);key(staff,'Enter');assert.equal(staff.calls.at(-1)[0],'place');
 key(staff,'Delete');assert.equal(staff.calls.some(c=>c[0]==='delete'),false);const before=staff.calls.length;key(staff,'ArrowUp',{target:element()});assert.equal(staff.calls.length,before);
 key(staff,'Escape');assert.equal(staff.calls.at(-1)[0],'clear-selection');key(staff,'z',{ctrlKey:true});assert.equal(staff.calls.at(-1)[0],'undo');
 staff.props.mode='edit';staff.props.modeVersion++;staff.props.selectedId=staff.props.events[0].id;staff.render();key(staff,'ArrowUp');assert.deepEqual(staff.calls.at(-1),['transpose',1]);key(staff,'Delete');assert.equal(staff.calls.at(-1)[0],'delete');
});
test('mode round trips and score revisions cancel held gestures, scheduled previews and native commands',t=>{
 const staff=mount(t);let e=staff.event({clientX:175});staff.root().onPointerDown(e);
 staff.props.mode='edit';staff.props.modeVersion++;staff.render();staff.props.mode='place';staff.props.modeVersion++;staff.render();staff.root().onPointerUp(e);
 staff.root().onPointerDown(e);staff.props.revision++;staff.props.events=[...staff.props.events];staff.render();staff.root().onPointerUp(e);
 staff.props.requestedOperation={token:1,modeVersion:2,revision:0,command:{kind:'fill',tick:units(0),pitch:64}};staff.render();
 assert.equal(staff.calls.some(c=>c[0]==='place'),false);tap(staff);assert.equal(staff.calls.filter(c=>c[0]==='place').length,1);
});
test('Write ignores measured chord heads but different pitches add tones; Edit selects stable members',t=>{
 const event={id:'c',midi:60,duration:'quarter',tones:[{id:'c-tone',spelling:model.entryPitch(60,0)},{id:'d-tone',spelling:model.entryPitch(62,0)}]};
 const selections=[];const staff=mount(t,{events:[event,...model.initialEvents().slice(1)],onSelect:(...args)=>selections.push(args)},[[170,180]]);
 tap(staff,183,145);assert.equal(selections.length,0);tap(staff,175,130);assert.deepEqual(staff.calls.find(c=>c[0]==='add-tone'),['add-tone',{kind:'add-tone',eventId:'c',pitch:67}]);
 staff.props.mode='edit';staff.props.modeVersion++;staff.render();tap(staff,183,145);assert.deepEqual(selections.at(-1),['c','d-tone']);
});
test('Edit styling marks only the selected chord member and redraws every tied fragment',t=>{
 const chord={id:'chord',midi:60,duration:'whole',tones:[{id:'c',spelling:model.entryPitch(60,0)},{id:'d',spelling:model.entryPitch(62,0)}]};
 const staff=mount(t,{mode:'edit',events:[{id:'lead',midi:67,duration:'quarter'},chord],selectedId:'chord',selectedToneId:'d'});
 const heads=()=>staff.notes.flatMap(n=>n.heads).filter(n=>n.classes.has('sheet-editor-note-selected'));
 const rings=()=>staff.canvas.querySelector().children.filter(n=>n.attributes?.class==='sheet-editor-tone-selection');
 assert.equal(rings().length,0);assert.equal(heads().length,2);assert.ok(heads().every(n=>n.dataset.toneId==='d'));
 assert.ok(staff.notes.every(note=>!note.classes.has('sheet-editor-selected')));
 staff.props.selectedToneId='c';staff.render();assert.equal(rings().length,0);assert.equal(heads().length,2);assert.ok(heads().every(n=>n.dataset.toneId==='c'));
});
test('invalid geometry disables entry; retry, resize, listener and frame cleanup recover safely',async t=>{
 const staff=mount(t);staff.valid(false);staff.viewport.clientWidth=700;staff.resize();await setTimeout(100);staff.render();assert.equal(staff.root()['aria-disabled'],true);tap(staff);assert.equal(staff.calls.some(c=>c[0]==='place'),false);
 staff.valid(true);staff.nodes().find(node=>node.type==='button').props.onClick();staff.render();assert.equal(staff.root()['aria-disabled'],false);host.reset();assert.ok(staff.disconnected()>0);assert.equal(staff.listeners.size,0);
});
test('legacy tied/displaced chord fragments still select the same logical member in Edit',t=>{
 const selections=[];
 const chord={id:'chord',midi:60,duration:'whole',tones:[{id:'c',spelling:model.entryPitch(60,0)},{id:'d',spelling:model.entryPitch(62,0)}]};
 const staff=mount(t,{mode:'edit',events:[{id:'lead',midi:67,duration:'quarter'},chord],onSelect:(...args)=>selections.push(args)},[[170,180],[260,270],[350,360]]);
 tap(staff,273,145);tap(staff,363,145);assert.deepEqual(selections,[['chord','d'],['chord','d']]);assert.equal(staff.calls.some(c=>c[0]==='place'),false);
});

test('full-score preview compares the score snapshot when the active part differs from the first staff',t=>{
 const score={bpm:80,key:'G',staffs:[{id:'upper',clef:'treble',events:model.initialEvents()},{id:'lower',clef:'bass',events:model.initialEvents().map(e=>({...e,id:'bass-'+e.id}))}]};
 const staff=mount(t,{score,activeStaffId:'lower',events:score.staffs[1].events,selection:[],entryAccidental:'key'});
 staff.root().onPointerMove(staff.event({clientX:175}));staff.frames();assert.equal(staff.preview.style.display,'block');tap(staff,175);assert.deepEqual(staff.calls.find(c=>c[0]==='place'),['place',{tick:units(0),pitch:64,staffId:'upper'}]);
});

test('SVG-local measurements support rendering and entry when screen glyph rectangles are unavailable',t=>{
 const staff=mount(t,{},[],{screenRects:false});assert.equal(staff.root()['aria-disabled'],false);
 tap(staff,175);assert.deepEqual(staff.calls.find(c=>c[0]==='place'),['place',{tick:units(0),pitch:64}]);
});

test('initial unavailable geometry retries on the next frame and recovers without manual retry',t=>{
 const staff=mount(t,{},[],{ready:false});assert.equal(staff.root()['aria-disabled'],true);assert.equal(staff.renders(),1);
 staff.valid(true);staff.frames();staff.render();assert.equal(staff.root()['aria-disabled'],false);assert.equal(staff.renders(),2);
 assert.ok(!staff.nodes().some(n=>n.props?.role==='alert'));tap(staff,175);assert.equal(staff.calls.filter(c=>c[0]==='place').length,1);
});

test('persistent geometry failure retries once, reports its cause and cancels pending retry on unmount',t=>{
 const warn=t.mock.method(console,'warn',()=>{}),staff=mount(t,{},[],{ready:false});staff.frames();staff.render();
 assert.equal(staff.renders(),2);assert.equal(warn.mock.calls.length,1);assert.match(warn.mock.calls[0].arguments[1].message,/Missing staff geometry/);
 staff.frames();assert.equal(staff.renders(),2,'no endless render/retry loop');
 staff.nodes().find(n=>n.type==='button').props.onClick();staff.render();const count=staff.renders();host.reset();staff.frames();assert.equal(staff.renders(),count);
});

test('Place staff arrows transpose its selected note and return to caret pitch navigation when selection clears',t=>{
 const event={id:'placed',midi:60,duration:'quarter'},ref={staffId:'staff-1',eventId:'placed',toneId:'placed:tone'};
 const staff=mount(t,{events:[event,...model.initialEvents().slice(1)],selectedId:event.id,selectedToneId:ref.toneId,selection:[ref],onPitchStep:delta=>staff.calls.push(['pitch-step',delta])});
 staff.root().onFocus({target:staff.viewport,currentTarget:staff.viewport});staff.frames();assert.equal(staff.preview.style.display,'none','selected note stays visible rather than showing a new-entry ghost');
 key(staff,'ArrowUp');assert.deepEqual(staff.calls.at(-1),['transpose',1]);assert.equal(staff.calls.some(c=>c[0]==='pitch-step'),false);
 staff.props.selection=[];staff.props.selectedId=null;staff.render();key(staff,'ArrowDown');assert.deepEqual(staff.calls.at(-1),['pitch-step',-1]);
});


test('zoom cancels held gestures and scheduled previews, then engraves at the new physical size',t=>{
 const staff=mount(t);const oldWidth=staff.canvas.style.width;
 staff.root().onPointerMove(staff.event({clientX:175}));
 const event=staff.event({clientX:175});staff.root().onPointerDown(event);
 staff.props.zoom=1.5;staff.render();staff.frames();staff.root().onPointerUp(event);
 assert.equal(staff.calls.some(c=>c[0]==='place'),false);assert.equal(parseFloat(staff.canvas.style.width),parseFloat(oldWidth)*1.5);assert.equal(staff.preview.style.display,'none');
 tap(staff);assert.ok(staff.calls.some(c=>c[0]==='place'));
});

test('zoom and resize invalidate a preview before it can be promoted',t=>{
 const staff=mount(t);staff.root().onPointerMove(staff.event({clientX:175}));staff.frames();const old=staff.preview.querySelector();
 staff.props.zoom=2;staff.render();assert.equal(staff.preview.style.display,'none');
 staff.root().onPointerMove(staff.event({clientX:175}));staff.frames();assert.notEqual(staff.preview.querySelector(),old);
 const count=staff.renders();staff.props.zoom=1;staff.render();assert.ok(staff.renders()>count);
});

test('native marking and staff buttons resolve wrapped staffs, consume score input and expose separate trailing actions', t => {
 const properties=[], measures=[];
 const staff=mount(t,{onProperty:(...args)=>properties.push(args),onAddMeasure:()=>measures.push('measure')},[],{width:1280,markings:true});
 const buttons=staff.nodes().filter(node=>node.type==='button'),settings=buttons.filter(node=>node.props['data-staff-settings']),markings=buttons.filter(node=>node.props['data-property']),add=buttons.filter(node=>node.props.className==='score-add-measure');
 assert.equal(settings.length,0);assert.equal(markings.length,4);assert.equal(add.length,1);
 for(const button of markings){const anchor={focus(){}};button.props.onClick({currentTarget:anchor});assert.equal(properties.at(-1)[0],button.props['data-property']);assert.equal(properties.at(-1)[1],'staff-1');assert.equal(properties.at(-1)[2],anchor);assert.ok(Number.isFinite(button.props.style.left));assert.ok(Number.isFinite(button.props.style.top));assert.match(button.props['aria-label'],/currently/);}
 add[0].props.onClick();assert.equal(measures.length,1);
 assert.ok(add[0].props.style.left>Math.max(...staff.notes.map(note=>note.getBBox().x+note.getBBox().width)));
 const overlay=staff.nodes().find(node=>node.props?.className==='score-native-controls');
 let stopped=0;for(const kind of ['onPointerDown','onPointerUp','onPointerMove','onKeyDown'])overlay.props[kind]({stopPropagation(){stopped++;}});
 assert.equal(stopped,4);assert.equal(staff.calls.some(call=>['place','select','add-tone'].includes(call[0])),false);
});

test('notation fallbacks remain native and mobile measure controls reserve a centered right gutter at every zoom', t => {
 for(const zoom of [.75,1,1.5,2]) {
  const staff=mount(t,{zoom,onProperty(){},onAddMeasure(){}},[],{width:375});
  const buttons=staff.nodes().filter(node=>node.type==='button'),add=buttons.find(node=>node.props.className==='score-add-measure');
  assert.ok(add);assert.equal(add.props.style.transform,'translateY(-50%)');assert.equal(add.props.style.top,finalSystemCenter(staff));
  assert.equal(staff.engravingOptions().paddingright*zoom,128);
  assert.ok(add.props.style.left>Math.max(...staff.notes.map(note=>note.getBBox().x+note.getBBox().width))*zoom);
  const fallbacks=buttons.filter(node=>node.props['aria-label']?.startsWith('Change '));assert.ok(fallbacks.some(node=>node.props['aria-label'].includes('key signature, currently C')));assert.ok(fallbacks.some(node=>node.props['aria-label'].includes('time signature')));
  assert.equal(staff.calls.some(call=>call[0]==='place'),false);
 }
});

test('Write ignores note clicks in both Notes and Rests entry while Edit still selects', t => {
 const events=model.tentativeFill(model.initialEvents(),{tick:0,pitch:60},{duration:'quarter',accidental:0},'pitched');
 const staff=mount(t,{events,entryKind:'rest'});
 tap(staff,175,150);assert.equal(staff.calls.filter(call=>call[0]==='place').length,0);assert.equal(staff.calls.filter(call=>call[0]==='select').length,0);
 staff.props.entryKind='note';staff.render();tap(staff,175,150,'touch');assert.equal(staff.calls.filter(call=>['place','add-tone','select'].includes(call[0])).length,0);
 staff.props.mode='edit';staff.props.modeVersion++;staff.render();tap(staff,175,150);assert.equal(staff.calls.filter(call=>call[0]==='select').length,1);
});

test('unmeasurable marking transforms use labeled fallbacks without guessing targets or crashing', t => {
 const staff=mount(t,{onProperty(){},onAddMeasure(){}},[],{width:1280,markings:true,brokenMarkings:true});
 assert.equal(staff.nodes().filter(node=>node.props?.['data-property']).length,0);
 assert.equal(staff.nodes().filter(node=>node.type==='button'&&node.props['aria-label']?.startsWith('Change ')).length,4);
 assert.equal(staff.nodes().some(node=>node.props?.className==='score-staff-settings'),false);
 staff.root().onFocus({target:{tagName:'BUTTON'},currentTarget:staff.viewport});staff.frames();assert.notEqual(staff.preview.style.display,'block');
});

test('wrapped occurrences keep their logical staff ID and only the final occurrence has a Measure action', t => {
 const events=Array.from({length:20},(_,i)=>({id:'rest-'+i,midi:null,duration:'quarter'})),properties=[];
 const staff=mount(t,{events,onProperty:(...args)=>properties.push(args),onAddMeasure(){}},[],{width:600,markings:true});
 const settings=staff.nodes().filter(node=>node.props?.['data-property']==='clef');assert.ok(settings.length>1);
 for(const button of settings){button.props.onClick({currentTarget:{}});assert.equal(properties.at(-1)[1],'staff-1');}
 const add=staff.nodes().filter(node=>node.props?.className==='score-add-measure');assert.equal(add.length,1);assert.ok(add[0].props.style.top>=settings.at(-1).props.style.top);
});

test('Edit rest hover, click and Enter only select; they never preview or apply a tuplet',t=>{
 const staff=mount(t,{mode:'edit'}),before=staff.props.events,renders=staff.renders();
 staff.root().onPointerMove(staff.event({clientX:175,clientY:140}));staff.frames();tap(staff,175,140);key(staff,'Enter');
 assert.equal(staff.preview.style.display,'none');assert.equal(staff.renders(),renders);assert.equal(staff.props.events,before);assert.deepEqual(staff.calls.filter(call=>call[0]==='select'),[['select',before[0].id]]);assert.equal(staff.calls.some(call=>['place','add-tone'].includes(call[0])),false);
});

test('Edit rest selection reports the actual staff even when another staff is active',t=>{
 const score={meter:model.DEFAULT_METER,tempoBeat:model.DEFAULT_TEMPO_BEAT,bpm:120,key:'C',staffs:[{id:'upper',clef:'tenor',events:model.initialEvents()},{id:'lower',clef:'alto',events:model.initialEvents().map(event=>({...event,id:'lower-'+event.id}))}]},selected=[];
 const staff=mount(t,{mode:'edit',score,events:score.staffs[0].events,activeStaffId:'upper',onSelect:(...args)=>selected.push(args)});tap(staff,175,400,'touch');assert.equal(selected[0][0],score.staffs[1].events[0].id);assert.equal(selected[0][2],'lower');assert.equal(staff.calls.some(call=>['place','add-tone'].includes(call[0])),false);
});

test('Alto and Tenor pointer entry project the correct bottom staff pitch',t=>{
 for(const [clef,bottom] of [['alto',53],['tenor',50]]){
  const score={meter:model.DEFAULT_METER,tempoBeat:model.DEFAULT_TEMPO_BEAT,bpm:120,key:'C',staffs:[{id:'staff-1',clef,events:model.initialEvents()}]};
  const staff=mount(t,{score});tap(staff,175,140);assert.deepEqual(staff.calls.find(call=>call[0]==='place'),['place',{tick:0,pitch:bottom,staffId:'staff-1'}]);
 }
});

test('Edit selection resolves wrapped and display-split rests without mutating their rhythm',t=>{
 const events=Array.from({length:20},(_,i)=>({id:'rest-'+i,midi:null,duration:'quarter'})),applied=[];
 const staff=mount(t,{mode:'edit',events,onSelect:(eventId,_toneId,staffId)=>applied.push([staffId,eventId])},[],{width:600,markings:true});
 const wrapped=staff.notes.find(note=>note.getBBox().y>=370);assert.ok(wrapped);tap(staff,wrapped.getBBox().x+5,wrapped.getBBox().y+5);assert.deepEqual(applied.at(-1),[undefined,wrapped.dataset.eventId]);assert.notEqual(applied.at(-1)[1],'rest-0');
 const score={meter:{numerator:3,denominator:4},tempoBeat:model.DEFAULT_TEMPO_BEAT,bpm:120,key:'C',staffs:[{id:'staff-1',clef:'alto',events:[{id:'long-rest',midi:null,duration:'whole',authored:true},{id:'pad-1',midi:null,duration:'quarter'},{id:'pad-2',midi:null,duration:'quarter'}]}]},split=[];
 const other=mount(t,{mode:'edit',score,events:score.staffs[0].events,onSelect:(eventId,_toneId,staffId)=>split.push([staffId,eventId])});
 const fragments=other.notes.filter(note=>note.dataset.eventId==='long-rest');assert.ok(fragments.length>1);const fragment=fragments[1];tap(other,fragment.getBBox().x+5,fragment.getBBox().y+5);assert.deepEqual(split.at(-1),['staff-1','long-rest']);
});

test('one shared Measure action is vertically centered across the final system staffs',t=>{
 const score={meter:model.DEFAULT_METER,tempoBeat:model.DEFAULT_TEMPO_BEAT,bpm:120,key:'C',staffs:[{id:'upper',clef:'treble',events:model.initialEvents()},{id:'lower',clef:'bass',events:model.initialEvents().map(event=>({...event,id:'low-'+event.id}))}]};
 const staff=mount(t,{score,onProperty(){},onAddMeasure(){}},[],{width:1280,markings:true});
 const buttons=staff.nodes().filter(node=>node.props?.className==='score-add-measure');assert.equal(buttons.length,1);assert.equal(buttons[0].props.style.top,250);assert.equal(buttons[0].props.style.transform,'translateY(-50%)');
});

test('Staff stays below the last staff while Measure stays centered across the group at every zoom',t=>{
 for(const width of [375,1280])for(const zoom of [.75,1,1.5,2]){
  const score={meter:model.DEFAULT_METER,tempoBeat:model.DEFAULT_TEMPO_BEAT,bpm:120,key:'C',staffs:['treble','bass','alto','tenor'].map((clef,index)=>({id:'staff-'+index,clef,events:model.initialEvents().map(event=>({...event,id:`${index}-${event.id}`}))}))};
  const widget=createElement('button',{'data-add-staff':true},'+ Staff');
  const staff=mount(t,{score,zoom,onProperty(){},onAddMeasure(){},staffActions:widget},[],{width,markings:true});
  const actions=staff.nodes().find(node=>node.props?.className==='score-inline-staff-actions'),measures=staff.nodes().filter(node=>node.props?.className==='score-add-measure');
  assert.ok(actions);assert.equal(measures.length,1);assert.ok(actions.props.style.top>920*zoom);assert.ok(flatten(actions).some(node=>node.props?.['data-add-staff']));
  assert.equal(actions.props.style.left,341*zoom);assert.equal(actions.props.style.transform,'translateX(-50%)');
  const notationBottom=Math.max(...staff.notes.map(note=>note.getBBox().y+note.getBBox().height))*zoom;
  assert.ok(actions.props.style.top>=notationBottom+48,'reserve a clear gap above Add staff');
  assert.equal(measures[0].props.style.top,finalSystemCenter(staff));assert.equal(measures[0].props.style.transform,'translateY(-50%)');
  assert.ok(actions.props.style.top>measures[0].props.style.top+22);
 }
});

test('adding or removing staffs and wrapping preserves one measure button at the center of the final system',t=>{
 for(const width of [320,1280])for(const zoom of [.75,1,2]){
  const partCount=4;
  const score={meter:model.DEFAULT_METER,tempoBeat:model.DEFAULT_TEMPO_BEAT,bpm:120,key:'C',staffs:Array.from({length:partCount},(_,index)=>({id:'staff-'+index,clef:index?'bass':'treble',events:Array.from({length:48},(_,i)=>({id:`rest-${index}-${i}`,midi:null,duration:'quarter'}))}))};
  const staff=mount(t,{score,events:score.staffs[0].events,zoom,onProperty(){},onAddMeasure(){}},[],{width,markings:true});
  for(const count of [4,3,2,1,2,3,4]){
   staff.props.score={...score,staffs:score.staffs.slice(0,count)};staff.props.revision++;staff.render();
   const buttons=staff.nodes().filter(node=>node.props?.className==='score-add-measure');assert.equal(buttons.length,1);
   const rowCount=new Set(staff.notes.map(note=>note.getBBox().y)).size;
   assert.ok(rowCount>count,'score should wrap into multiple systems');
   assert.equal(buttons[0].props.style.top,finalSystemCenter(staff,count));
   assert.equal(buttons[0].props.style.transform,'translateY(-50%)');
   assert.equal(staff.engravingOptions().paddingright*zoom,128);
   assert.ok(buttons[0].props.style.left+108<=Number.parseFloat(staff.canvas.style.width));
  }
 }
});

test('R16 missing tempo marking uses a beat symbol rather than a visible duration name',t=>{
 const staff=mount(t,{onProperty(){},onAddMeasure(){}}),button=staff.nodes().find(node=>node.type==='button'&&node.props['aria-label']?.startsWith('Change tempo'));
 assert.ok(button);assert.ok(flatten(button).some(node=>node.props?.duration==='quarter'));
 const contents=JSON.stringify(button.props.children);assert.equal(contents.includes('quarter ='),false);
});

test('R17 selected rests are highlighted on their own staff and clear with selection',t=>{
 const score={meter:model.DEFAULT_METER,tempoBeat:model.DEFAULT_TEMPO_BEAT,bpm:120,key:'C',staffs:[{id:'upper',clef:'treble',events:model.initialEvents()},{id:'lower',clef:'bass',events:model.initialEvents()}]};
 const id=score.staffs[0].events[0].id,staff=mount(t,{score,mode:'edit',events:score.staffs[1].events,activeStaffId:'lower',selectedId:id,selectedToneId:null});
 const selected=()=>staff.notes.filter(note=>note.classes.has('sheet-editor-rest-selected'));
 assert.equal(selected().length,1);assert.equal(selected()[0].dataset.staffId,'lower');
 staff.props.activeStaffId='upper';staff.props.events=score.staffs[0].events;staff.render();assert.equal(selected().length,1);assert.equal(selected()[0].dataset.staffId,'upper');
 staff.props.selectedId=null;staff.render();assert.equal(selected().length,0);assert.equal(staff.calls.some(call=>['place','add-tone'].includes(call[0])),false);
});
