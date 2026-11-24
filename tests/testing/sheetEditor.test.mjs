import assert from 'node:assert/strict';
import test from 'node:test';
import { previewUrl,expressionsUrl,playbackUrl,rhythmUrl,codeUrl as expressionCodeUrl,scoreUrl, musicUrl, flatten, hookHostUrl, modelUrl, moduleUrl, sourceUrl, codeUrl, parserUrl, model } from './sheetEditorModules.mjs';
const units=value=>value*420;

const hostUrl = hookHostUrl('sheet editor page');
const host = await import(hostUrl);
const dependenciesUrl = moduleUrl(`
  export const calls = [];
  export const audio = { reverb:false, setReverb: value=>{audio.reverb=value;calls.push(['reverb',value]);}, sound: 'synth', playing: null, audioError: '',
    pressedNotes: new Set(), startNote: (...args) => {calls.push(['start',...args]);return Promise.resolve();}, releaseNote: (...args) => calls.push(['release',...args]),
    stopAudio: () => calls.push(['stop']),
    playTimeline: (...args) => { calls.push(['timeline', ...args]); return Promise.resolve(); },
    playArrangement: (...args) => { calls.push(['arrangement', ...args]); return Promise.resolve(); },
    playMelody: (...args) => { calls.push(['play', ...args]); return Promise.resolve(); },
    setSound: value => calls.push(['sound', value]) };
  export function usePianoAudio(steps, bpm) { calls.push(['configuration', steps, bpm]); return audio; }
  export function Link() {}
  export default function Stub() {}
`);
const dependencies = await import(dependenciesUrl);
const { default: SheetEditor } = await import(await sourceUrl('src/components/testing/sheet-editor/SheetEditor.tsx', {
  react: hostUrl, 'react-router-dom': dependenciesUrl,
  '../../brodle/components/RhythmSymbol': dependenciesUrl,
  '../../brodle/components/BrodleIcon': dependenciesUrl,
  '../../brodle/hooks/usePianoAudio': dependenciesUrl,
  './sheetEditorExpressions':expressionsUrl,'./ClefChoices':dependenciesUrl,'./NotationPreview':dependenciesUrl,'./sheetEditorPreview':previewUrl, './EditableStaff': dependenciesUrl, './sheetEditorModel': modelUrl, './scoreModel':scoreUrl, './sheetEditorRhythm':rhythmUrl, './sheetEditorPlayback':playbackUrl, '../../brodle/lib/musicGame':musicUrl, './sheetEditorCode': codeUrl, './sheetEditorCodeParser': parserUrl, './SheetCodeEditor': dependenciesUrl,
}));
const text = node => Array.isArray(node) ? node.map(text).join('') : typeof node === 'string' || typeof node === 'number' ? String(node) : text(node?.props?.children ?? []);

function mount(t) {
  host.reset(); dependencies.calls.length = 0;
  Object.assign(dependencies.audio, { reverb:false, sound: 'synth', playing: null, audioError: '' });
  const originals = new Map(['document', 'localStorage', 'sessionStorage'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { title: 'Original title' } });
  for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(globalThis, name, { configurable: true, get() { assert.fail(`The experimental page accessed ${name}`); } });
  t.after(() => {
    host.reset();
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  });
  let elements;
  function render() {
    for (let i = 0; i < 8; i++) {
      host.begin(); const tree = SheetEditor(); elements = flatten(tree).flatMap(node=>node.props?.staffActions?[node,...flatten(node.props.staffActions)]:[node]); host.flush();
      if (!host.dirty) return tree;
    }
    assert.fail('Page did not settle');
  }
  render();
  return {
    render,
    staff: () => elements.find(node => typeof node.props?.onPlace === 'function').props,
    button: label => {
      label=({'Place notes':'Write','Edit notes':'Edit','Manage parts':'Manage staffs','Manage staffs':'Manage staffs'}[label]??label);
      const find = name => [...flatten(elements.find(n=>n.props?.id==='studio-rhythm-palette')), ...elements].find(node => node.type === 'button' && String(node.props?.['aria-label'] ?? text(node)).replace(/^[^A-Za-z]*/, '').startsWith(name));
      const open = name => { const trigger=find(name); if(trigger){trigger.props.onClick({currentTarget:{focus(){}}});render();} };
      if(label==='Add staff') { if(!find('Create staff'))open('Add staff'); label='Create staff'; }
      if(label==='Add measure') return {disabled:elements.find(node=>typeof node.props?.onPlace==='function').props.locked,onClick:elements.find(node=>typeof node.props?.onPlace==='function').props.onAddMeasure};
      let button=find(label);
      if(!button){
        if(['Sixteenth','Eighth','Quarter','Half','Whole'].some(value=>label.startsWith(value))) open(label.endsWith('rest')?'Rests':'Notes');
        else if(['Zoom in','Zoom out','Reset zoom'].includes(label)) open('View settings');
        else if(label.startsWith('Remove staff')) open('Manage staffs');
        else if([...Object.values(model.TUPLET_NAMES),'Remove tuplet','Close tuplets'].includes(label) && !find('Tuplets')?.props.disabled) open('Tuplets');
        button=find(label);
      }
      assert.ok(button,label);return button.props;
    },
    nodes: () => elements,
  };
}


const openProperty=(page,kind,staffId=page.staff().activeStaffId)=>{page.staff().onProperty(kind,staffId);page.render();};
const field=(page,label)=>{if(label==='Tempo beat unit'){const buttons=page.nodes().filter(n=>n.props?.['data-tempo-beat']);return {value:buttons.find(n=>n.props['aria-pressed'])?.props['data-tempo-beat'],onChange:event=>buttons.find(n=>n.props['data-tempo-beat']===event.target.value).props.onClick()};}const node=page.nodes().find(n=>n.props?.['aria-label']===label&&typeof n.props.onChange==='function');return ['input','select'].includes(node.type)?node.props:{...node.props,onChange:event=>node.props.onChange(event.target.value)};};
const submitProperty=page=>{page.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});page.render();};
const codeEditor=page=>page.nodes().find(node=>typeof node.props?.onApply==='function').props;
const code=codeEditor;
const note=(page,midi)=>page.staff().events.find(event=>event.midi===midi);
const choose=(page,id)=>{page.button('Edit notes').onClick();page.render();page.staff().onSelect(id);page.render();};
test('initial page always shows editable four-rest code with Play, Reset and Undo disabled',t=>{
 const page=mount(t);assert.equal(page.staff().events.length,4);assert.equal(page.button('Quarter')['aria-pressed'],true);assert.equal(page.button('Play').disabled,true);assert.equal(page.button('Reset score').disabled,true);assert.equal(page.button('Undo').disabled,true);
 assert.equal((code(page).value.match(/"midi":null/g)??[]).length,4);
 const before=code(page).value;page.button('Sixteenth').onClick();page.render();assert.equal(code(page).value,before);assert.equal(page.staff().events.length,4);
});
test('actual fill, pitch/duration/delete/reset controls preserve time and update committed code',t=>{
 const page=mount(t);page.button('Sixteenth').onClick();page.render();page.staff().onPlace({tick:units(2),pitch:60});page.render();
 const id=note(page,60).id;assert.equal(model.totalTicks(page.staff().events)/420,16);assert.equal(page.staff().events.length,6);assert.ok(code(page).value.includes('"duration":"sixteenth"'));
 choose(page,id);page.nodes().find(n=>n.type==='select'&&n.props.value==='C4').props.onChange({target:{value:'D4'}});page.render();
 page.button('Eighth').onClick();page.render();assert.equal(note(page,62).duration,'eighth');assert.equal(model.totalTicks(page.staff().events)/420,16);
 page.button('Delete event').onClick();page.render();assert.ok(model.isInitialScore(page.staff().events));
 page.button('Undo').onClick();page.render();assert.equal(note(page,62).duration,'eighth');assert.equal(page.staff().mode,'edit');
 page.button('Reset score').onClick();page.render();assert.ok(model.isInitialScore(page.staff().events));assert.equal((code(page).value.match(/"midi":null/g)??[]).length,4);
});
test('native chord entry and member edits share the committed playable/code data',t=>{
 const page=mount(t);page.staff().onPlace({tick:units(0),pitch:60});page.render();const id=note(page,60).id;
 page.staff().onAddTone({kind:'add-tone',eventId:id,pitch:64});page.render();
 assert.equal(page.staff().mode,'place');assert.equal(page.staff().selectedId,id);assert.equal(page.staff().selectedToneId,model.eventTones(page.staff().events[0])[1].id);assert.ok(code(page).value.includes('"pitches":[60,64]'));
 choose(page,id);const group=page.nodes().find(n=>n.props?.['aria-label']==='Chord tones');flatten(group).find(n=>n.type==='button'&&text(n)==='E4').props.onClick({shiftKey:false});page.render();
 page.button('Up semitone').onClick();page.render();assert.ok(code(page).value.includes('"pitches":[60,65]'));
 page.button('Play').onClick();const played=dependencies.calls.filter(c=>c[0]==='timeline'&&c[2]==='testing-sheet-editor').at(-1)[1];assert.deepEqual(played.events.map(e=>e.midi),[60,65]);assert.equal(played.totalDuration,2);
 page.button('Delete tone').onClick();page.render();assert.equal(model.eventTones(note(page,60)).length,1);assert.equal(model.totalTicks(page.staff().events)/420,16);
});
test('explicit modes preserve entry values and protect score/code from stale callbacks, targets and invalid fills',t=>{
 const page=mount(t);page.button('Eighth').onClick();page.render();page.staff().onPlace({tick:units(4),pitch:60});page.render();
 const id=note(page,60).id,oldPlace=page.staff().onPlace;page.staff().onSelect(id);page.render();const original=page.staff().events,before=code(page).value;
 page.button('Sharp').onClick();page.render();page.button('Whole').onClick();page.render();assert.equal(page.staff().events,original);assert.equal(code(page).value,before);
 page.staff().onPlace({tick:units(-1),pitch:64});page.render();assert.equal(page.staff().events,original);assert.equal(code(page).value,before);
 page.button('Edit notes').onClick();page.render();assert.equal(page.button('Notes').disabled,true);oldPlace({tick:units(8),pitch:64});page.render();assert.equal(page.staff().events,original);
 page.button('Place notes').onClick();page.render();oldPlace({tick:units(8),pitch:64});page.render();assert.equal(page.staff().events,original);assert.equal(page.staff().duration,'whole');assert.equal(page.staff().accidental,1);
});
test('measure actions, rhythmic target buttons and rest editing remain accessible and timing-aware',t=>{
 const page=mount(t);page.button('Eighth').onClick();page.render();
 const slots=page.nodes().find(n=>n.props?.['aria-label']==='Rhythmic positions');const offbeat=flatten(slots).find(n=>n.type==='button'&&n.props['aria-label']==='Measure 1, beat 1 + 0.5');assert.ok(offbeat);offbeat.props.onClick();page.render();assert.equal(page.staff().caret.tick/420,2);
 page.button('Add measure').onClick();page.render();assert.equal(model.totalTicks(page.staff().events)/420,32);assert.equal((code(page).value.match(/"midi":null/g)??[]).length,8);
 choose(page,page.staff().events[4].id);assert.equal(flatten(page.nodes().find(n=>n.type==='fieldset'&&text(n).includes('Edit event'))).filter(n=>n.type==='select').length,1,'rest duration is derived; only pitch conversion is shown');
 page.nodes().find(n=>n.type==='select'&&n.props.value==='rest').props.onChange({target:{value:'G4'}});page.render();assert.equal(note(page,67).duration,'quarter');assert.equal(model.timedEvents(page.staff().events).find(s=>s.event.midi===67).start/420,16);
});
test('initial silence does not play; edits/modes/Stop/unmount retain audio cleanup and remount resets',t=>{
 const page=mount(t);page.staff().onPlace({tick:units(0),pitch:76});page.render();page.button('Play').onClick();const played=dependencies.calls.find(c=>c[0]==='timeline'&&c[2]==='testing-sheet-editor');assert.equal(played[2],'testing-sheet-editor');assert.equal(played[1].totalDuration,2);assert.deepEqual(played[1].events.map(p=>p.midi),[76]);
 const stops=()=>dependencies.calls.filter(c=>c[0]==='stop').length;let before=stops();page.button('Edit notes').onClick();page.render();assert.equal(stops(),before+1);
 dependencies.audio.playing='testing-sheet-editor';page.render();page.button('Stop').onClick();before=stops();host.reset();assert.equal(stops(),before+1);page.render();assert.ok(model.isInitialScore(page.staff().events));
});
test('audio failure still allows editing and synth fallback; palette remains shortest to longest',t=>{
 const page=mount(t);dependencies.audio.audioError='Sound unavailable';dependencies.audio.sound='grand';page.render();assert.ok(page.nodes().some(n=>n.props?.role==='alert'&&text(n).includes('keep editing')));
 page.button('Notes').onClick();page.render();
 const palette=page.nodes().find(n=>n.props?.['aria-label']==='Note value');assert.deepEqual(flatten(palette).filter(n=>n.type==='button').map(n=>n.props['aria-label']),['Sixteenth','Eighth','Quarter','Half','Whole']);
 page.button('Use Synth').onClick();assert.deepEqual(dependencies.calls.at(-1),['sound','synth']);
});

const auditions=()=>dependencies.calls.filter(call=>call[0]==='timeline'&&call[2]==='testing-sheet-editor-entry');
const main=page=>page.nodes().find(node=>node.type==='main');
const keyboard=(page,key,extra={})=>{
 const event={key,nativeEvent:{isComposing:false},target:{closest:()=>null},preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra};
 main(page).props.onKeyDown(event);page.render();return event;
};
test('accepted entry auditions once, caps only preview time and leaves full Play available',t=>{
 const page=mount(t);assert.equal(auditions().length,0);
 page.button('Whole').onClick();page.render();const duplicate=page.staff().onPlace;
 duplicate({tick:units(0),pitch:60});page.render();assert.equal(auditions().length,1);
 assert.equal(auditions()[0][1].totalDuration,.5);assert.equal(auditions()[0][1].events[0].midi,60);assert.equal(auditions()[0][1].events[0].duration,.5);
 assert.equal(model.scoreSteps(page.staff().events)[0].beats,4);const before=page.staff().events;
 const stops=dependencies.calls.filter(c=>c[0]==='stop').length;duplicate({tick:units(0),pitch:60});page.render();assert.equal(auditions().length,1);assert.equal(page.staff().events,before);assert.equal(dependencies.calls.filter(c=>c[0]==='stop').length,stops);
 dependencies.audio.playing='testing-sheet-editor-entry';page.render();assert.equal(page.button('Stop').disabled,false);page.button('Stop').onClick();dependencies.audio.playing=null;page.render();
 page.button('Play').onClick();assert.equal(dependencies.calls.at(-1)[1].events[0].duration,2);
 page.button('Undo').onClick();page.render();page.button('Sixteenth').onClick();page.render();page.staff().onPlace({tick:units(2),pitch:64});page.render();
 assert.equal(auditions().length,2);assert.equal(auditions().at(-1)[1].events[0].duration,.125);
 page.render();page.render();assert.equal(auditions().length,2,'render/effect replay never auditions');
});
test('chord addition previews accepted simultaneous pitches; duplicates, selection and accepted semitone edits sound',t=>{
 const page=mount(t);page.staff().onPlace({tick:units(0),pitch:60});page.render();const id=note(page,60).id;
 page.staff().onAddTone({kind:'add-tone',eventId:id,pitch:64});page.render();assert.equal(auditions().length,2);assert.deepEqual(auditions().at(-1)[1].events.map(e=>e.midi),[60,64]);
 page.staff().onAddTone({kind:'add-tone',eventId:id,pitch:64});page.render();assert.equal(auditions().length,2);
 page.staff().onSelect(id);page.render();choose(page,id);page.button('Up semitone').onClick();page.render();assert.equal(auditions().length,3);
 const rest=page.staff().events.find(e=>e.midi===null);page.staff().onSelect(rest.id);page.render();
 page.nodes().find(n=>n.type==='select'&&n.props.value==='rest').props.onChange({target:{value:'G4'}});page.render();assert.equal(auditions().length,4);assert.equal(auditions().at(-1)[1].events[0].midi,67);
 page.button('Reset score').onClick();page.render();page.button('Undo').onClick();page.render();assert.equal(auditions().length,4);
});
test('dirty code locks direct score callbacks and Play, preserves selection and draft, then cancels stale round trips',t=>{
 const page=mount(t);page.staff().onPlace({tick:units(0),pitch:60});page.render();const initial=page.staff().events,id=note(page,60).id;
 const stalePlace=page.staff().onPlace,stalePlay=page.button('Play').onClick,old=code(page).value;
 codeEditor(page).onChange('// draft\n'+old);page.render();const draft=code(page).value;
 assert.equal(page.staff().locked,true);for(const name of ['Play','Undo','Reset score','Add measure'])assert.equal(page.button(name).disabled,true,name);
 const before=dependencies.calls.filter(c=>c[0]==='timeline').length;
 stalePlace({tick:units(4),pitch:64});page.staff().onPlace({tick:units(4),pitch:64});stalePlay();page.staff().onUndo();page.render();assert.equal(page.staff().events,initial);
 assert.equal(dependencies.calls.filter(c=>c[0]==='timeline').length,before);
 page.staff().onSelect(id);page.render();assert.equal(codeEditor(page).range.startLine,codeSnapshotFor(page,id).startLine+1);
 keyboard(page,'e');assert.equal(page.staff().mode,'edit');assert.equal(code(page).value,draft);page.staff().onSelect(id);page.render();
 page.button('Up semitone').onClick();page.render();assert.equal(page.staff().events,initial);
 codeEditor(page).onReset();page.render();assert.equal(page.staff().locked,false);assert.equal(code(page).value,old);assert.equal(page.staff().events,initial);
 keyboard(page,'n');stalePlace({tick:units(4),pitch:64});page.render();assert.equal(page.staff().events,initial,'unlock cannot revive stale callbacks');
 page.staff().onPlace({tick:units(4),pitch:64});page.render();assert.ok(note(page,64));
});
const codeSnapshotFor=(page,id)=>{
 const lines=codeEditor(page).value.replace(/^\/\/ draft\n/,'').split('\n');
 const index=page.staff().events.findIndex(e=>e.id===id);return {startLine:lines.findIndex(l=>l.includes('"midi":'))+1+index};
};
test('Apply/Reset code are atomic and silent; failed input retains exact text and identity and successful Apply is undoable',t=>{
 const page=mount(t);page.staff().onPlace({tick:units(0),pitch:60});page.render();const original=page.staff().events,canonical=code(page).value,before=auditions().length;
 codeEditor(page).onChange(canonical.replace('"midi":60','"midi":128'));page.render();const bad=code(page).value;
 codeEditor(page).onApply();page.render();assert.match(codeEditor(page).error,/line \d+/);assert.equal(code(page).value,bad);assert.equal(page.staff().events,original);
 codeEditor(page).onReset();page.render();assert.equal(code(page).value,canonical);assert.equal(page.staff().events,original);
 codeEditor(page).onChange('// normalize only\n'+canonical);page.render();codeEditor(page).onApply();page.render();assert.equal(page.staff().events,original);assert.equal(code(page).value,canonical);
 codeEditor(page).onChange(canonical.replace('"midi":60','"midi":62'));page.render();codeEditor(page).onApply();page.render();assert.equal(note(page,62).id,original[0].id);assert.equal(codeEditor(page).dirty,false);assert.equal(auditions().length,before);
 page.button('Undo').onClick();page.render();assert.equal(page.staff().events,original);assert.equal(code(page).value,canonical);assert.equal(auditions().length,before);
});
test('clean and dirty selected ranges link only matching events; invalid/moved pitches clear the link',t=>{
 const page=mount(t);page.staff().onPlace({tick:units(0),pitch:60});page.render();const id=note(page,60).id;
 page.staff().onSelect(id);page.render();const range=codeEditor(page).range;assert.ok(range);const canonical=code(page).value;
 codeEditor(page).onChange('\n\n// shifted\n'+canonical);page.render();assert.equal(codeEditor(page).range.startLine,range.startLine+3);
 codeEditor(page).onChange(canonical.replace('"midi":60','"midi":61'));page.render();assert.equal(codeEditor(page).range,null);assert.equal(codeEditor(page).linkMissing,true);
 codeEditor(page).onChange(canonical+' error');page.render();assert.equal(codeEditor(page).range,null);codeEditor(page).onReset();page.render();assert.deepEqual(codeEditor(page).range,range);
 keyboard(page,'e');page.staff().onSelect(id);page.render();assert.deepEqual(codeEditor(page).range,range);
 page.button('Delete event').onClick();page.render();assert.equal(codeEditor(page).range,null);
});
test('mode keys are scoped and silent, with native/composition/repeat/modifier exclusions and dirty preservation',t=>{
 const page=mount(t);const original=page.staff().events;
 assert.equal(page.button('Place notes')['aria-keyshortcuts'],'N');assert.equal(page.button('Edit notes')['aria-keyshortcuts'],'E');
 assert.equal(keyboard(page,'e').prevented,true);assert.equal(page.staff().mode,'edit');
 assert.equal(keyboard(page,'n').prevented,true);assert.equal(page.staff().mode,'place');
 const exclusions=[{defaultPrevented:true},{repeat:true},{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{nativeEvent:{isComposing:true}},
  ...['input','textarea','select','contenteditable'].map(tag=>({target:{closest:selector=>{assert.match(selector,/input,textarea,select,dialog,\[contenteditable\]/);return {tag};}}}))];
 for(const extra of exclusions){assert.equal(keyboard(page,'e',extra).prevented,undefined);assert.equal(page.staff().mode,'place');}
 assert.equal(page.staff().events,original);assert.equal(auditions().length,0);
 const draft='// dirty\n'+code(page).value;codeEditor(page).onChange(draft);page.render();keyboard(page,'e');assert.equal(code(page).value,draft);assert.equal(page.staff().mode,'edit');
});
test('an older Apply callback cannot overwrite a newer draft',t=>{
 const page=mount(t);const clean=code(page).value,original=page.staff().events;
 codeEditor(page).onChange('// first draft\n'+clean);page.render();const oldApply=codeEditor(page).onApply;
 codeEditor(page).onChange('// latest draft\n'+clean);page.render();const latest=code(page).value;
 oldApply();page.render();assert.equal(page.staff().events,original);assert.equal(code(page).value,latest);assert.equal(codeEditor(page).dirty,true);
 codeEditor(page).onApply();page.render();assert.equal(code(page).value,clean);assert.equal(page.staff().events,original);assert.equal(auditions().length,0);
});
test('Edit arrows from member controls change one tone, respect native fields and retain extended values',t=>{
 const page=mount(t);page.staff().onPlace({tick:units(0),pitch:53});page.render();const id=note(page,53).id;
 page.staff().onAddTone({kind:'add-tone',eventId:id,pitch:101});page.render();choose(page,id);
 const upper=model.eventTones(page.staff().events[0])[1];page.staff().onSelect(id,upper.id);page.render();const count=auditions().length;
 keyboard(page,'ArrowUp');assert.deepEqual(model.scoreSteps(page.staff().events)[0].pitches,[53,102]);assert.equal(page.staff().selectedToneId,upper.id);
 const field=page.nodes().find(n=>n.type==='select'&&n.props.value==='F#7');assert.ok(field);assert.ok(flatten(field).some(n=>n.type==='option'&&n.props.value==='F#7'));
 const before=page.staff().events;keyboard(page,'ArrowDown',{target:{closest:()=>({tagName:'TEXTAREA'})}});assert.equal(page.staff().events,before);
 keyboard(page,'ArrowDown',{repeat:true});assert.deepEqual(model.scoreSteps(page.staff().events)[0].pitches,[53,101]);assert.equal(auditions().length,count+2);
});

test('property drafts and code guards are atomic and preserve exact pending text',t=>{
 const page=mount(t),initial=code(page).value;page.button('Add staff').onClick();page.render();
 assert.equal(page.staff().score.staffs.length,2);assert.equal(page.staff().score.staffs[1].clef,'bass');
 openProperty(page,'tempo');field(page,'BPM').onChange({target:{value:'401'}});page.render();submitProperty(page);
 assert.equal(page.staff().score.bpm,120);assert.equal(code(page).blocked,true);assert.equal(page.nodes().find(n=>n.props?.['aria-label']==='Add staff').props.disabled,true);assert.ok(page.nodes().some(n=>n.props?.role==='alert'));
 page.button('Cancel').onClick();page.render();openProperty(page,'tempo');field(page,'BPM').onChange({target:{value:'60'}});page.render();submitProperty(page);
 assert.equal(page.staff().score.bpm,60);assert.match(code(page).value,/BPM = 60/);
 const stale=page.staff().onProperty,staleAdd=page.button('Add staff').onClick,clean=code(page).value;code(page).onChange('// keep exactly\n'+clean);page.render();stale('tempo',page.staff().activeStaffId);staleAdd();page.render();
 assert.equal(page.staff().score.staffs.length,2);assert.equal(page.staff().score.bpm,60);assert.equal(code(page).value,'// keep exactly\n'+clean);assert.ok(!page.nodes().some(n=>n.type==='dialog'));
 code(page).onReset();page.render();stale('key',page.staff().activeStaffId);page.render();assert.ok(!page.nodes().some(n=>n.type==='dialog'));
 page.button('Undo').onClick();page.render();assert.equal(page.staff().score.bpm,120);page.button('Undo').onClick();page.render();assert.equal(code(page).value,initial);
});

test('page caret and cross-part group arrows audition accepted destinations once at global BPM, with source-primary linkage',t=>{
 const page=mount(t);page.staff().onPitchStep(1);page.render();assert.equal(auditions().length,1);assert.equal(auditions()[0][1].events[0].midi,65);assert.equal(page.staff().revision,0);
 page.staff().onPlace({tick:units(0),pitch:60});page.render();const a=note(page,60);page.button('Add staff').onClick();page.render();const other=page.staff().activeStaffId;page.staff().onPlace({tick:units(4),pitch:60,staffId:other});page.render();const b=note(page,60);
 keyboard(page,'e');page.staff().onSelect(a.id,model.eventTones(a)[0].id,'staff-1');page.render();page.staff().onSelect(b.id,model.eventTones(b)[0].id,other,true);page.render();assert.equal(page.staff().selection.length,2);
 const line=code(page).range;assert.ok(line.startLine>15);assert.ok(code(page).value.slice(line.start,line.end).includes('"midi":60'));
 const before=auditions().length;keyboard(page,'ArrowUp',{shiftKey:true});assert.equal(auditions().length,before+1);assert.deepEqual(auditions().at(-1)[1],{totalDuration:.5,events:[{midi:61,time:0,duration:.5}]});assert.equal(page.staff().selection.length,2);assert.ok(page.staff().score.staffs.every(s=>s.events.some(e=>e.midi===61)));
 page.button('Play').onClick();const play=dependencies.calls.at(-1);assert.equal(play[0],'timeline');assert.equal(play[1].events.length,2);assert.equal(play[1].totalDuration,2);
 keyboard(page,'Delete');assert.ok(page.staff().score.staffs.every(s=>s.events.every(e=>e.midi===null)));page.button('Undo').onClick();page.render();assert.ok(page.staff().score.staffs.every(s=>s.events.some(e=>e.midi===61)));
});

test('most recently placed note has Place-mode pitch/duration controls and accepted arrows audition once',t=>{
 const page=mount(t);for(const [i,pitch] of [60,62,64,65].entries()){page.staff().onPlace({tick:units(i*4),pitch});page.render();}
 const last=note(page,65),ref=page.staff().selection[0];assert.equal(ref.eventId,last.id);assert.equal(page.staff().mode,'place');assert.ok(page.nodes().find(n=>n.props?.['aria-label']==='Placed note controls'));
 const before=auditions().length;keyboard(page,'ArrowUp');assert.equal(note(page,66).id,last.id);assert.equal(page.staff().selection[0].toneId,ref.toneId);assert.equal(auditions().length,before+1);assert.equal(auditions().at(-1)[1].events[0].midi,66);
 page.nodes().find(n=>n.props?.['aria-label']==='Selected note duration').props.onChange({target:{value:'eighth'}});page.render();assert.equal(note(page,66).duration,'eighth');assert.equal(page.staff().mode,'place');assert.equal(model.totalTicks(page.staff().events)/420,16);assert.ok(code(page).range);
 page.button('Continue placing').onClick();page.render();assert.equal(page.staff().selection.length,0);assert.equal(page.staff().mode,'place');assert.equal(page.nodes().some(n=>n.props?.['aria-label']==='Placed note controls'),false);
});

test('Place selected-note controls keep code draft locks and superseded commands cannot edit the next note',t=>{
 const page=mount(t);page.staff().onPlace({tick:units(0),pitch:60});page.render();const old=page.button('Up semitone').onClick,oldDuration=page.nodes().find(n=>n.props?.['aria-label']==='Selected note duration').props.onChange;
 page.staff().onPlace({tick:units(4),pitch:64});page.render();const original=page.staff().score;
 old();oldDuration({target:{value:'half'}});page.render();assert.equal(page.staff().score,original);
 const clean=code(page).value;code(page).onChange('// draft\n'+clean);page.render();page.button('Up semitone').onClick();page.nodes().find(n=>n.props?.['aria-label']==='Selected note duration').props.onChange({target:{value:'half'}});page.render();assert.equal(page.staff().score,original);assert.equal(code(page).value,'// draft\n'+clean);
});

test('dot and tie shortcuts are scoped, idempotent under native exclusions, undoable and silent',t=>{
 const page=mount(t);page.staff().onPlace({tick:0,pitch:60});page.render();const id=note(page,60).id,before=auditions().length;
 keyboard(page,'.');assert.equal(note(page,60).dotted,undefined);assert.equal(page.staff().dotted,true);assert.equal(auditions().length,before);const score=page.staff().score;
 for(const extra of [{repeat:true},{ctrlKey:true},{shiftKey:true},{nativeEvent:{isComposing:true}},{target:{closest:()=>({tagName:'TEXTAREA'})}}]){keyboard(page,'.',extra);assert.equal(page.staff().score,score);}
 keyboard(page,'.');page.staff().onSelect(id);page.render();page.staff().onPlace({tick:units(4),pitch:60});page.render();choose(page,id);keyboard(page,'t');assert.equal(model.eventTones(page.staff().events[0])[0].tieToNext,true);keyboard(page,'t');assert.equal(Boolean(model.eventTones(page.staff().events[0])[0].tieToNext),false);
});

test('Apply retains an invalid tie draft when preserved enharmonic spellings cannot connect',t=>{
 const page=mount(t);page.button('Flat').onClick();page.render();page.staff().onPlace({tick:0,pitch:62});page.render();page.button('Sharp').onClick();page.render();page.staff().onPlace({tick:units(4),pitch:60});page.render();
 const original=page.staff().score,draft=code(page).value.replace('"midi":61,','"midi":61,"tieToNext":[61],');code(page).onChange(draft);page.render();code(page).onApply();page.render();assert.equal(page.staff().score,original);assert.equal(code(page).value,draft);assert.match(code(page).error,/Invalid score/);
});

test('adding a chord member auditions the retained arpeggio direction exactly once',t=>{
 const page=mount(t);code(page).onChange("const BPM=120;const KEY='C';const TIME_SIGNATURE='4/4';const MELODY=[{midi:60,pitches:[60,64],duration:'whole',arpeggio:'down'}];");page.render();code(page).onApply();page.render();const id=note(page,60).id,before=auditions().length;
 page.staff().onAddTone({kind:'add-tone',eventId:id,pitch:67});page.render();assert.equal(auditions().length,before+1);const timeline=auditions().at(-1)[1];assert.deepEqual(timeline.events.map(e=>e.midi),[67,64,60]);assert.equal(timeline.events.at(-1).time,.12);
});





test('Notes/Rests keeps the selected value and dotted entry without mutating recent music',t=>{
 const page=mount(t);page.staff().onPlace({tick:0,pitch:60});page.render();const before=page.staff().score,id=page.staff().selectedId;
 page.button('Eighth').onClick();page.render();page.button('Dotted entry').onClick();page.render();page.button('Rests').onClick();page.render();
 assert.equal(page.staff().score,before);assert.equal(page.staff().selectedId,id);assert.equal(page.staff().duration,'eighth');assert.equal(page.staff().entryKind,'rest');assert.equal(page.staff().dotted,true);
 const icon=flatten({props:page.button('Dotted entry')}).find(n=>n.props?.duration);assert.equal(icon.props.duration,'quarter');assert.equal(icon.props.rest,false);assert.equal(icon.props.dotted,true);
 assert.equal(page.nodes().some(n=>n.props?.id==='studio-rhythm-palette'),false);
 page.button('Notes').onClick();page.render();assert.equal(page.staff().entryKind,'note');assert.equal(page.staff().duration,'eighth');assert.equal(page.staff().dotted,true);assert.equal(page.staff().score,before);
});

test('Write rests insert authored silence, never audition and cannot bypass dirty code',t=>{
 const page=mount(t);page.staff().onPlace({tick:model.TICKS_PER_BEAT,pitch:60});page.render();const id=note(page,60).id,before=page.staff().score,count=auditions().length;
 page.button('Rests').onClick();page.render();page.button('Whole rest').onClick();page.render();page.staff().onPlace({tick:0,pitch:64});page.render();
 assert.equal(page.staff().events[0].duration,'whole');assert.equal(page.staff().events[0].authored,true);assert.equal(page.staff().events[0].midi,null);assert.equal(model.timedEvents(page.staff().events).find(e=>e.event.id===id).start,model.MEASURE_TICKS);assert.equal(auditions().length,count);
 page.button('Undo').onClick();page.render();assert.equal(page.staff().score,before);
 const stale=page.staff().onPlace;code(page).onChange('// keep\n'+code(page).value);page.render();stale({tick:0,pitch:64});page.render();assert.equal(page.staff().score,before);
});


test('Edit uses visible values, Rest, Dot and accidental controls for the selection',t=>{
 const page=mount(t);page.staff().onPlace({tick:units(12),pitch:67});page.render();const id=note(page,67).id;choose(page,id);
 assert.equal(page.button('Notes').disabled,false);assert.equal(page.button('Rests').disabled,false);
 assert.equal(page.nodes().filter(n=>n.props?.['aria-label']==='Notes').length,1);
 const before=page.staff().score;page.button('Half').onClick();page.render();assert.equal(note(page,67).duration,'half');assert.equal(model.totalTicks(page.staff().events),2*model.MEASURE_TICKS);assert.equal(page.staff().selectedId,id);
 page.button('Undo').onClick();page.render();assert.equal(page.staff().score,before);page.staff().onSelect(id);page.render();
 page.button('Selected dotted').onClick();page.render();assert.equal(note(page,67).dotted,true);
 page.button('Sharp').onClick();page.render();assert.equal(note(page,68).dotted,true);
 page.button('Rests').onClick();page.render();page.button('Eighth').onClick();page.render();assert.equal(page.staff().events.some(e=>model.eventTones(e).length),false);
});

test('Edit duration buttons cannot apply a stale choice after selection changes or a code draft locks editing',t=>{
 const page=mount(t);page.staff().onPlace({tick:0,pitch:60});page.render();page.staff().onPlace({tick:units(4),pitch:64});page.render();choose(page,note(page,60).id);
 const stale=page.button('Whole').onClick;page.staff().onSelect(note(page,64).id);page.render();const before=page.staff().score;stale();page.render();assert.equal(page.staff().score,before);
 const locked=page.button('Half').onClick;code(page).onChange('// draft\n'+code(page).value);page.render();locked();page.render();assert.equal(page.staff().score,before);assert.equal(page.button('Notes').disabled,true);
});


test('tempo dialog applies beat/BPM atomically, Cancel and Undo preserve previous settings',t=>{
 const page=mount(t),before=page.staff().score;openProperty(page,'tempo');field(page,'BPM').onChange({target:{value:'60'}});page.render();field(page,'Tempo beat unit').onChange({target:{value:'half'}});page.render();field(page,'Dotted tempo beat').onChange({target:{checked:true}});page.render();
 assert.equal(page.staff().score,before);submitProperty(page);assert.equal(page.staff().score.bpm,60);assert.deepEqual(page.staff().score.tempoBeat,{duration:'half',dotted:true});assert.equal(page.button('Reset score').disabled,false);
 page.button('Undo').onClick();page.render();assert.equal(page.staff().score,before);openProperty(page,'tempo');field(page,'BPM').onChange({target:{value:'90'}});page.render();page.button('Cancel').onClick();page.render();assert.equal(page.staff().score,before);
});

test('tempo rejects invalid drafts and dirty code blocks property callbacks',t=>{
 const page=mount(t),before=page.staff().score;
 for(const value of ['', '19','401','120.5']) {openProperty(page,'tempo');field(page,'BPM').onChange({target:{value}});page.render();submitProperty(page);assert.equal(page.staff().score,before);assert.ok(page.nodes().some(n=>n.props?.role==='alert'));page.button('Cancel').onClick();page.render();}
 for(const value of ['20','400']) {openProperty(page,'tempo');field(page,'BPM').onChange({target:{value}});page.render();submitProperty(page);assert.equal(page.staff().score.bpm,Number(value));}
 const current=page.staff().score;code(page).onChange('// draft\n'+code(page).value);page.render();openProperty(page,'tempo');assert.ok(!page.nodes().some(n=>n.type==='dialog'));assert.equal(page.staff().score,current);
});

test('zoom is display-only, preserves selected notes/drafts and cancels stale placement callbacks',t=>{
 const page=mount(t);page.staff().onPlace({tick:0,pitch:60});page.render();const before=page.staff().score,id=page.staff().selectedId,revision=page.staff().revision,stale=page.staff().onPlace;
 page.button('Zoom in').onClick();page.render();assert.equal(page.staff().zoom,1.25);assert.equal(page.staff().score,before);assert.equal(page.staff().selectedId,id);assert.equal(page.staff().revision,revision);
 stale({tick:units(4),pitch:64});page.render();assert.equal(page.staff().score,before);
 const draft='// keep draft\n'+code(page).value;code(page).onChange(draft);page.render();page.button('Zoom in').onClick();page.render();assert.equal(code(page).value,draft);assert.equal(page.staff().zoom,1.5);assert.equal(page.staff().score,before);
 page.button('Reset zoom').onClick();page.render();assert.equal(page.staff().zoom,1);
 page.button('Zoom out').onClick();page.render();assert.equal(page.staff().zoom,.75);assert.equal(page.button('Zoom out').disabled,true);
 for(let i=0;i<5;i++){page.button('Zoom in').onClick();page.render();}assert.equal(page.staff().zoom,2);assert.equal(page.button('Zoom in').disabled,true);
});

test('workspace length is derived from logical score capacity and simultaneous parts',t=>{
 const page=mount(t),footer=()=>text(page.nodes().find(n=>n.type==='footer'));
 assert.match(footer(),/1 measure · 4 beats · 1 part/);assert.match(footer(),/Enter\s*Place/);assert.doesNotMatch(footer(),/Del\s*Delete/);page.button('Add measure').onClick();page.render();assert.match(footer(),/2 measures · 8 beats · 1 part/);
 page.button('Add staff').onClick();page.render();assert.match(footer(),/2 measures · 8 beats · 2 parts/);page.button('Edit notes').onClick();page.render();assert.match(footer(),/Del\s*Delete/);assert.doesNotMatch(footer(),/Enter\s*Place/);
});

test('toolbar exposes five glyph durations, three accidentals and direct expression controls',t=>{
 const page=mount(t),accidentals=flatten(page.nodes().find(n=>n.props?.['aria-label']==='Accidentals')).filter(n=>n.type==='button');
 assert.deepEqual(accidentals.map(n=>n.props['aria-label']),['Sharp','Flat','Natural']);assert.equal(page.button('Natural')['aria-pressed'],true);
 page.button('Natural').onClick();page.render();assert.equal(page.staff().entryAccidental,0);assert.equal(page.nodes().some(n=>n.props?.['aria-label']==='More'),false);assert.equal(page.button('Tie').disabled,true);assert.equal(page.button('Arpeggio').disabled,true);
 assert.ok(page.nodes().some(n=>text(n).includes('Toggle dotted notes or rests')));
 for(const name of ['Notes','Rests']) {page.button(name).onClick();page.render();const values=flatten(page.nodes().find(n=>n.props?.['aria-label']==='Note value')).filter(n=>n.type==='button');assert.equal(values.length,5);for(const value of values){assert.equal(text(value),'');assert.ok(value.props['aria-label']);assert.ok(value.props['data-tooltip']);}}
 assert.equal(page.nodes().some(n=>['View settings','Entry settings'].includes(n.props?.['aria-label'])),false);
 const command=page.nodes().find(n=>n.props?.className==='studio-command-row');assert.equal(flatten(command).filter(n=>n.type==='button').length,5);
});

test('dedicated Staff action and scoped settings add four staffs, change clef, remove and undo',t=>{
 const page=mount(t);for(let index=2;index<=4;index++){page.button('Add staff').onClick();page.render();assert.equal(page.staff().score.staffs.length,index);}
 assert.equal(page.nodes().find(n=>n.props?.['aria-label']==='Add staff').props.disabled,true);
 const fourth=page.staff().score.staffs[3],first=page.staff().score.staffs[0];openProperty(page,'clef',fourth.id);field(page,'Staff clef').onChange({target:{value:'treble'}});page.render();submitProperty(page);assert.equal(page.staff().score.staffs[3].clef,'treble');assert.equal(page.staff().score.staffs[0],first);
 openProperty(page,'clef',page.staff().score.staffs[1].id);page.button('Remove staff').onClick();page.render();assert.equal(page.staff().score.staffs.length,3);page.button('Undo').onClick();page.render();assert.equal(page.staff().score.staffs.length,4);
});

test('direct Tie and Arpeggio controls update the same committed notation and retain dismissal focus',t=>{
 const page=mount(t);
 page.staff().onPlace({tick:0,pitch:60});page.render();const first=note(page,60).id;
 page.staff().onPlace({tick:model.TICKS_PER_BEAT,pitch:60});page.render();choose(page,first);
 assert.equal(page.button('Tie').disabled,false);page.button('Tie').onClick();page.render();
 assert.equal(model.eventTones(page.staff().events[0])[0].tieToNext,true);
 page.button('Untie').onClick();page.render();assert.equal(Boolean(model.eventTones(page.staff().events[0])[0].tieToNext),false);
 page.button('Place notes').onClick();page.render();page.staff().onSelect(first);page.render();
 page.staff().onAddTone({kind:'add-tone',eventId:first,pitch:64});page.render();
 let focused=0;page.button('Arpeggio').onClick({currentTarget:{focus(){focused++;}}});page.render();
 page.button('Ascending').onClick();page.render();assert.equal(page.staff().events[0].arpeggio,'up');assert.equal(focused,1);
 assert.ok(code(page).value.includes('"arpeggio":"up"'));
 page.button('Arpeggio').onClick({currentTarget:{focus(){focused++;}}});page.render();
 page.button('Off').onClick();page.render();assert.equal(page.staff().events[0].arpeggio,undefined);assert.equal(focused,2);
});

test('Positions reaches the endpoint and placement there creates one undoable measure',t=>{
 const page=mount(t),before=page.staff().score;
 page.button('End of score').onClick();page.render();assert.equal(page.staff().score,before);assert.equal(page.staff().caret.tick,model.MEASURE_TICKS);
 page.staff().onPlace({...page.staff().caret});page.render();
 assert.equal(model.totalTicks(page.staff().events),2*model.MEASURE_TICKS);
 page.button('Undo').onClick();page.render();assert.equal(page.staff().score,before);
});

test('key/meter dialogs apply globally from a secondary staff, cancel safely and reject impossible tuplets', t => {
 const page=mount(t);page.staff().onPlace({tick:0,pitch:60});page.render();page.button('Add staff').onClick();page.render();
 const second=page.staff().activeStaffId,before=page.staff().score;
 openProperty(page,'key',second);field(page,'Key signature').onChange({target:{value:'G'}});page.render();assert.equal(page.staff().score,before);
 submitProperty(page);assert.equal(page.staff().score.key,'G');assert.equal(page.staff().score.staffs[0].events,before.staffs[0].events);
 page.button('Undo').onClick();page.render();assert.equal(page.staff().score,before);
 openProperty(page,'meter',second);field(page,'Numerator').onChange({target:{value:'3'}});page.render();submitProperty(page);
 assert.deepEqual(page.staff().score.meter,{numerator:3,denominator:4});assert.ok(page.staff().score.staffs.every(part=>model.totalTicks(part.events)===6*model.TICKS_PER_BEAT));
 page.button('Undo').onClick();page.render();assert.equal(page.staff().score,before);
 openProperty(page,'meter',second);field(page,'Numerator').onChange({target:{value:'33'}});page.render();submitProperty(page);assert.equal(page.staff().score,before);assert.ok(page.nodes().some(n=>n.props?.role==='alert'));
 const dialog=page.nodes().find(n=>n.type==='dialog');let prevented=false;dialog.props.onCancel({preventDefault(){prevented=true;}});page.render();assert.equal(prevented,true);assert.equal(page.staff().score,before);
});

test('Edit toggles type immediately and Dotted/period edit only the selected event', t => {
 const page=mount(t);code(page).onChange("const BPM=120;const KEY='C';const TIME_SIGNATURE='4/4';const MELODY=[{midi:60,pitches:[60,64],duration:'half',dotted:true},{midi:null,duration:'quarter'}];");page.render();code(page).onApply();page.render();
 const id=note(page,60).id;choose(page,id);const original=page.staff().score;
 page.button('Rests').onClick();page.render();assert.equal(page.staff().events[0].midi,null);assert.equal(page.staff().events[0].duration,'half');assert.equal(page.staff().events[0].dotted,true);
 const icon=flatten({props:page.button('Selected dotted')}).find(n=>n.props?.duration);assert.equal(icon.props.rest,false);assert.equal(icon.props.duration,'quarter');
 page.button('Notes').onClick();page.render();assert.equal(page.staff().events[0].midi,64);assert.equal(model.eventTones(page.staff().events[0]).length,1);
 keyboard(page,'.');assert.equal(page.staff().events[0].dotted,false);assert.equal(page.staff().dotted,false);
 page.button('Undo').onClick();page.render();page.button('Undo').onClick();page.render();page.button('Undo').onClick();page.render();assert.equal(page.staff().score,original);
});


test('canceled and superseded property callbacks cannot apply obsolete drafts', t => {
 const page=mount(t),before=page.staff().score;
 openProperty(page,'tempo');const staleForm=page.nodes().find(node=>node.type==='form').props.onSubmit;
 field(page,'BPM').onChange({target:{value:'80'}});page.render();staleForm({preventDefault(){}});page.render();assert.equal(page.staff().score,before);
 const canceledForm=page.nodes().find(node=>node.type==='form').props.onSubmit;
 page.button('Cancel').onClick();page.render();canceledForm({preventDefault(){}});page.render();assert.equal(page.staff().score,before);
 openProperty(page,'meter');canceledForm({preventDefault(){}});page.render();assert.equal(page.nodes().find(node=>node.type==='dialog').props['aria-labelledby'],'score-property-title');assert.equal(page.staff().score,before);
 page.button('Cancel').onClick();page.render();
});

const selectRest=(page,event=page.staff().events.find(event=>event.midi===null))=>{if(page.staff().mode!=='edit'){page.button('Edit').onClick();page.render();}page.staff().onSelect(event.id);page.render();};
test('sheet-only workspace puts Staff below the score and retains accessible accidental buttons without the caption', t=>{
 const page=mount(t),nodes=page.nodes(),staffIndex=nodes.findIndex(node=>typeof node.props?.onPlace==='function'),addIndex=nodes.findIndex(node=>node.props?.['data-add-staff']!==undefined),footerIndex=nodes.findIndex(node=>node.type==='footer');
 assert.ok(addIndex>staffIndex);assert.ok(addIndex<footerIndex);
 assert.equal(nodes.some(node=>node.props?.['aria-label']==='Input method'||typeof node.props?.onInput==='function'),false);
 assert.equal(nodes.some(node=>node.props?.className==='studio-accidental-label'),false);
 assert.equal(page.button('Natural')['aria-pressed'],true);assert.equal(page.button('Tuplets').disabled,true);
 page.button('Add staff').onClick();page.render();assert.equal(page.staff().score.staffs.length,2);
 openProperty(page,'clef');field(page,'Staff clef').onChange({target:{value:'alto'}});page.render();submitProperty(page);assert.equal(page.staff().score.staffs[1].clef,'alto');
 page.button('Undo').onClick();page.render();assert.equal(page.staff().score.staffs[1].clef,'bass');
});

test('all seven tuplet presets infer values from suitable rests and preserve their exact span with Undo',t=>{
 const page=mount(t);
 for(const [count,name] of Object.entries(model.TUPLET_NAMES)){
  const dotted=['2','4','8'].includes(count);
  const steps=[{midi:null,duration:'quarter',dotted},{midi:60,duration:'quarter'},{midi:null,duration:dotted?'quarter':'half',dotted}];
  code(page).onChange(`const BPM=120;const KEY='C';const TIME_SIGNATURE='4/4';const MELODY=${JSON.stringify(steps)};`);page.render();code(page).onApply();page.render();assert.equal(code(page).error,'');
  selectRest(page);const initial=page.staff().score,span=model.eventTicks(page.staff().events[0]),later=model.timedEvents(page.staff().events).find(item=>item.event.midi===60);
  assert.equal(page.button(name).disabled,false);page.button(name).onClick();page.render();
  const members=page.staff().events.filter(event=>event.tuplet);
  assert.equal(members.length,Number(count));assert.equal(model.totalTicks(members),span);assert.ok(members.every(event=>event.duration===(['2','3','4'].includes(count)?'eighth':'sixteenth')));
  const after=model.timedEvents(page.staff().events).find(item=>item.event.id===later.event.id);assert.equal(after.start,later.start);
  assert.equal(model.totalTicks(page.staff().events),model.MEASURE_TICKS);assert.equal(auditions().length,0);
  page.button('Undo').onClick();page.render();assert.equal(page.staff().score,initial);
 }
});

test('tuplet buttons reject notes and stale selections or drafts without touching music',t=>{
 const page=mount(t);page.staff().onPlace({tick:0,pitch:60});page.render();const before=page.staff().score,id=note(page,60).id,count=auditions().length;
 choose(page,id);assert.equal(page.button('Tuplets').disabled,true);
 selectRest(page);const old=page.button('Triplet').onClick;page.staff().onSelect(id);page.render();old();page.render();assert.equal(page.staff().score,before);
 selectRest(page);const stale=page.button('Triplet').onClick;selectRest(page,page.staff().events.at(-1));stale();page.render();assert.equal(page.staff().score,before);
 const locked=page.button('Triplet').onClick;code(page).onChange('// draft\n'+code(page).value);page.render();locked();page.render();assert.equal(page.staff().score,before);assert.equal(page.button('Tuplets').disabled,true);assert.equal(auditions().length,count);
 code(page).onReset();page.render();selectRest(page);const propertyStale=page.button('Triplet').onClick;openProperty(page,'tempo');propertyStale();page.render();assert.equal(page.staff().score,before);page.button('Cancel').onClick();page.render();
});

test('automatic tuplet values replace the manual selector and empty groups remain editable and removable',t=>{
 const page=mount(t);selectRest(page);const before=page.staff().score;
 page.button('Tuplets').onClick({currentTarget:{focus(){}}});page.render();
 assert.equal(page.nodes().some(node=>node.props?.['aria-label']==='Tuplet written value'),false);assert.equal(page.staff().score,before);
 for(const name of ['Duplet','Quadruplet','Octuplet'])assert.equal(page.button(name).disabled,true);
 const invalid=page.button('Duplet').onClick;invalid();page.render();assert.equal(page.staff().score,before);
 page.button('Quintuplet').onClick();page.render();assert.equal(page.staff().events.filter(event=>event.tuplet).length,5);assert.ok(page.staff().events.filter(event=>event.tuplet).every(event=>event.duration==='sixteenth'));
 selectRest(page,page.staff().events[2]);page.button('Triplet').onClick();page.render();assert.equal(page.staff().events.filter(event=>event.tuplet).length,3);assert.equal(model.totalTicks(page.staff().events.filter(event=>event.tuplet)),model.TICKS_PER_BEAT);
 const grouped=page.staff().score;page.button('Remove tuplet').onClick();page.render();assert.equal(page.staff().events.some(event=>event.tuplet),false);page.button('Undo').onClick();page.render();assert.equal(page.staff().score,grouped);
});

test('Write mode and Reset disable selection-dependent tuplet commands',t=>{
 const page=mount(t);selectRest(page);const before=page.staff().score,stale=page.button('Triplet').onClick;
 page.button('Write').onClick();page.render();stale();page.render();assert.equal(page.staff().score,before);assert.equal(page.button('Tuplets').disabled,true);
 selectRest(page);page.button('Triplet').onClick();page.render();page.button('Reset score').onClick();page.render();assert.equal(model.isInitialScore(page.staff().events),true);assert.equal(page.button('Tuplets').disabled,true);
});

test('key and tempo previews follow drafts, never changing music or playing on render',t=>{
 const page=mount(t),before=page.staff().score;
 openProperty(page,'key');field(page,'Key signature').onChange({target:{value:'D'}});page.render();
 assert.ok(page.nodes().some(node=>node.props?.musicalKey==='D'));assert.ok(page.nodes().some(node=>text(node)==='2 sharps: F♯, C♯'));assert.equal(page.staff().score,before);
 page.button('Cancel').onClick();page.render();openProperty(page,'tempo');
 for(const duration of model.NOTE_VALUES)for(const dotted of [false,true]){
  field(page,'Tempo beat unit').onChange({target:{value:duration}});page.render();field(page,'Dotted tempo beat').onChange({target:{checked:dotted}});page.render();field(page,'BPM').onChange({target:{value:'60'}});page.render();
  const preview=page.nodes().find(node=>node.props?.['aria-label']==='Tempo preview'),symbol=flatten(preview).find(node=>node.props?.duration);
  assert.equal(symbol.props.duration,duration);assert.equal(symbol.props.dotted,dotted);assert.match(text(preview),/= 60/);assert.equal(page.staff().score,before);
 }
 for(const value of ['', '19','401','120.5']){field(page,'BPM').onChange({target:{value}});page.render();const preview=page.nodes().find(node=>node.props?.['aria-label']==='Tempo preview');assert.ok(text(preview).includes('—'));assert.equal(text(preview).includes('NaN'),false);}
 assert.equal(auditions().length,0);page.button('Cancel').onClick();page.render();assert.equal(page.staff().score,before);
});

test('rest selection and later rest clicks never perform a tuplet transformation',t=>{
 const page=mount(t),initial=page.staff().score;selectRest(page);assert.equal(page.staff().score,initial);
 page.button('Triplet').onClick();page.render();const grouped=page.staff().score;selectRest(page,page.staff().events.at(-1));assert.equal(page.staff().score,grouped);assert.equal(page.staff().onTuplet,undefined);assert.equal(page.staff().tupletTool,undefined);
 assert.equal(page.nodes().some(node=>node.props?.['aria-label']==='Choose a tuplet'),false);
});

test('R16 tempo beat selector uses symbols and Staff belongs to the score rather than a separate strip',t=>{
 const page=mount(t);assert.ok(page.staff().staffActions);assert.equal(page.nodes().some(node=>node.props?.className==='studio-staff-actions'),false);
 openProperty(page,'tempo');assert.equal(page.nodes().some(node=>node.type==='select'&&node.props['aria-label']==='Tempo beat unit'),false);
 const choices=page.nodes().filter(node=>node.type==='button'&&node.props?.['data-tempo-beat']);assert.equal(choices.length,5);assert.deepEqual(choices.map(node=>node.props['data-tempo-beat']),model.NOTE_VALUES);
 for(const node of choices){assert.equal(text(node),'');assert.ok(flatten(node).some(child=>child.props?.duration===node.props['data-tempo-beat']));assert.ok(node.props['aria-label']);}
});

test('tuplet commands preserve native button focus without moving focus into an armed score tool',t=>{
 const page=mount(t);let focused=0;main(page).ref.current={querySelector:()=>({focus(){focused++;}})};
 selectRest(page);page.button('Triplet').onClick();page.render();assert.equal(focused,0);assert.equal(page.staff().onTuplet,undefined);
});

test('tempo symbol choices remain draft-only alongside the collapsed tuplet menu',t=>{
 const page=mount(t),before=page.staff().score;assert.equal(page.nodes().filter(node=>node.props?.['data-tuplet-preset']).length,0);assert.equal(page.button('Tuplets').disabled,true);openProperty(page,'tempo');
 const half=page.nodes().find(node=>node.props?.['data-tempo-beat']==='half');half.props.onClick();page.render();assert.equal(page.staff().score,before);assert.equal(page.nodes().find(node=>node.props?.['data-tempo-beat']==='half').props['aria-pressed'],true);
 field(page,'BPM').onChange({target:{value:'60'}});page.render();submitProperty(page);assert.deepEqual(page.staff().score.tempoBeat,{duration:'half',dotted:false});assert.equal(page.staff().score.bpm,60);
});

test('R16 inline Staff opens a dialog outside the scrolling score so its choices cannot be clipped',t=>{
 const page=mount(t);selectRest(page);page.button('Triplet').onClick();page.render();
 const trigger=page.nodes().find(node=>node.props?.['data-add-staff']);trigger.props.onClick({currentTarget:{focus(){}}});page.render();
 assert.equal(page.staff().tupletTool,undefined);assert.ok(page.nodes().some(node=>node.type==='dialog'&&node.props['aria-label']==='Add a staff'));
 assert.equal(flatten(page.staff().staffActions).some(node=>node.type==='dialog'||node.props?.['aria-label']==='New staff clef'),false);
 field(page,'New staff clef').onChange({target:{value:'tenor'}});page.render();page.button('Create staff').onClick();page.render();assert.equal(page.staff().score.staffs.at(-1).clef,'tenor');
});

test('R17 select a rest first, then a named tuplet button applies to that rest only',t=>{
 const page=mount(t);page.button('Edit').onClick();page.render();const before=page.staff().score,id=page.staff().events[0].id;
 page.staff().onSelect(id);page.render();assert.equal(page.staff().score,before);assert.equal(page.button('Undo').disabled,true);
 page.button('Tuplets').onClick({currentTarget:{focus(){}}});page.render();
 const buttons=page.nodes().filter(node=>node.type==='button'&&node.props?.['data-tuplet-preset']);assert.equal(buttons.length,7);
 page.button('Triplet').onClick();page.render();assert.equal(page.staff().events.filter(event=>event.tuplet).length,3);assert.equal(auditions().length,0);
 const grouped=page.staff().score;page.staff().onSelect(page.staff().events.at(-1).id);page.render();assert.equal(page.staff().score,grouped);
 page.button('Undo').onClick();page.render();assert.equal(page.staff().score,before);
});

test('tuplet menu sits beside expression tools, uses notation symbols and retains rest-first editing',t=>{
 const page=mount(t),names=Object.values(model.TUPLET_NAMES),initial=page.staff().score;
 assert.equal(page.button('Tuplets').disabled,true);
 assert.equal(page.nodes().some(node=>node.props?.['data-tuplet-preset']),false);
 page.button('Edit').onClick();page.render();assert.equal(page.button('Tuplets').disabled,true);
 selectRest(page);let focused=0;
 const tools=page.nodes().find(node=>node.props?.['aria-label']==='Expression tools');
 assert.deepEqual(flatten(tools).filter(node=>node.type==='button').map(node=>node.props['aria-label']),['Selected dotted','Staccato','Tie','Arpeggio','Tuplets']);
 assert.equal(page.nodes().some(node=>node.props?.className==='studio-selected-tuplets'),false);
 page.button('Tuplets').onClick({currentTarget:{focus(){focused++;}}});page.render();
 assert.equal(page.button('Tuplets')['aria-expanded'],true);assert.equal(page.staff().score,initial);assert.equal(page.button('Undo').disabled,true);
 const menu=page.nodes().find(node=>node.props?.['aria-label']==='Choose a tuplet');
 const presets=flatten(menu).filter(node=>node.props?.['data-tuplet-preset']);
 assert.deepEqual(presets.map(preset=>preset.props['aria-label']),names);
 for(const preset of presets){
  const count=preset.props['data-tuplet-preset'],glyph=flatten(preset).find(node=>node.type==='svg');
  assert.equal(text(preset),String(count));assert.equal(glyph.props['aria-hidden'],'true');
  assert.equal(flatten(glyph).filter(node=>node.type==='ellipse').length,count);
  assert.doesNotMatch(text(preset)+' '+preset.props['data-tooltip'],/\d+:\d+/);
 }
 const triplet=presets.find(preset=>preset.props['data-tuplet-preset']===3),quintuplet=presets.find(preset=>preset.props['data-tuplet-preset']===5);
 assert.match(triplet.props['data-tooltip'],/Eighth notes/);assert.match(quintuplet.props['data-tooltip'],/Sixteenth notes/);
 assert.equal(page.staff().score,initial);
 main(page).props.onKeyDownCapture({key:'Escape',preventDefault(){},stopPropagation(){}});page.render();
 assert.equal(focused,1);assert.equal(page.button('Tuplets')['aria-expanded'],false);assert.equal(page.staff().score,initial);
 page.button('Tuplets').onClick({currentTarget:{focus(){focused++;}}});page.render();
 page.button('Triplet').onClick();page.render();assert.equal(focused,2);
 assert.equal(page.staff().events.filter(event=>event.tuplet).length,3);assert.equal(page.button('Tuplets')['aria-expanded'],false);
 assert.equal(page.nodes().some(node=>node.props?.['data-tuplet-preset']),false);
 assert.equal(page.staff().onTuplet,undefined);assert.equal(page.staff().tupletTool,undefined);
});


test('Light reverb toggles independently of score and history, with Dotted beside expressions',t=>{
 const page=mount(t),before=page.staff().score;
 const tools=page.nodes().find(node=>node.props?.['aria-label']==='Expression tools');
 assert.deepEqual(flatten(tools).filter(node=>node.type==='button').map(node=>node.props['aria-label']),['Dotted entry','Staccato','Tie','Arpeggio','Tuplets']);
 assert.equal(page.button('Light reverb')['aria-pressed'],false);const stops=dependencies.calls.filter(call=>call[0]==='stop').length;
 page.button('Light reverb').onClick();page.render();assert.equal(page.button('Light reverb')['aria-pressed'],true);
 assert.equal(page.staff().score,before);assert.equal(page.button('Undo').disabled,true);assert.equal(dependencies.calls.filter(call=>call[0]==='stop').length,stops);
 page.button('Light reverb').onClick();page.render();assert.equal(page.button('Light reverb')['aria-pressed'],false);
 assert.equal(dependencies.calls.filter(call=>call[0]==='timeline').length,0);
});

test('Write ignores existing-note selection from the staff and disables note sequence buttons; Edit restores it',t=>{
 const page=mount(t);page.staff().onPlace({tick:0,pitch:60});page.render();const first=note(page,60).id;
 page.staff().onPlace({tick:units(4),pitch:64});page.render();const before=page.staff().score,selected=page.staff().selectedId;
 page.staff().onSelect(first);page.render();assert.equal(page.staff().selectedId,selected);assert.equal(page.staff().score,before);
 const sequence=page.nodes().find(node=>node.props?.['aria-label']==='Score events');
 assert.ok(flatten(sequence).filter(node=>node.type==='button'&&node.props['aria-label']?.startsWith('Target')&&!text(node).includes('Rest')).every(node=>node.props.disabled));
 choose(page,first);assert.equal(page.staff().selectedId,first);assert.equal(page.staff().mode,'edit');
});


test('fixed dotted/staccato icons and upward Tie retain their distinct marks across entry types and values',t=>{
 const page=mount(t);
 for(const duration of ['Sixteenth','Eighth','Quarter','Half','Whole'])for(const kind of ['Notes','Rests']){
  page.button(kind).onClick();page.render();page.button(duration+(kind==='Rests'?' rest':'')).onClick();page.render();
  const dotted=flatten({props:page.button('Dotted entry')}).find(node=>node.props?.duration),staccato=flatten({props:page.button('Staccato')}).find(node=>node.props?.duration);
  assert.equal(dotted.props.duration,'quarter');assert.equal(dotted.props.rest,false);assert.equal(dotted.props.dotted,true);
  assert.equal(staccato.props.duration,'quarter');assert.equal(staccato.props.staccato,true);assert.equal(Boolean(staccato.props.dotted),false);
 }
 const tie=flatten({props:page.button('Tie')}).find(node=>node.type==='path');assert.equal(tie.props.d,'M2 14 Q12 0 22 14');
});

test('Staccato configures Write entries, edits selected notes with Undo and clears on rest conversion',t=>{
 const page=mount(t),initial=page.staff().score;
 page.button('Staccato').onClick();page.render();assert.equal(page.staff().score,initial);assert.equal(page.button('Undo').disabled,true);assert.equal(page.button('Staccato')['aria-pressed'],true);
 page.staff().onPlace({tick:0,pitch:60});page.render();const id=note(page,60).id,marked=page.staff().score;
 assert.equal(note(page,60).staccato,true);assert.equal(auditions().at(-1)[1].events[0].duration,.25);assert.equal(auditions().at(-1)[1].events[0].sustain,true);assert.ok(code(page).value.includes('"staccato":true'));
 choose(page,id);const count=auditions().length;page.button('Staccato').onClick();page.render();assert.equal(Boolean(note(page,60).staccato),false);assert.equal(auditions().length,count);
 page.button('Undo').onClick();page.render();assert.equal(page.staff().score,marked);choose(page,id);assert.equal(page.button('Staccato')['aria-pressed'],true);
 page.button('Rests').onClick();page.render();assert.equal(page.staff().events[0].staccato,undefined);assert.equal(page.button('Staccato').disabled,true);
 page.button('Undo').onClick();page.render();choose(page,id);const old=page.button('Staccato').onClick;code(page).onChange('// draft\n'+code(page).value);page.render();old();page.render();assert.equal(page.staff().score,marked);
 code(page).onReset();page.render();page.button('Reset score').onClick();page.render();assert.equal(page.staff().staccato,false);assert.equal(page.button('Staccato')['aria-pressed'],false);
});
