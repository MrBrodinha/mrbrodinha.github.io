import assert from 'node:assert/strict';
import test from 'node:test';
import { hookHostUrl, moduleUrl, sourceUrl } from './sheetEditorModules.mjs';
import { studio, studioUrl } from './studioModules.mjs';
const hostUrl=hookHostUrl('studio autosave'),host=await import(hostUrl);
const apiUrl=moduleUrl(`
 export let search=new URLSearchParams();export const navigate=(url)=>{search=new URLSearchParams(url.split('?')[1]??'');};
 export const useSearchParams=()=>[search],useNavigate=()=>navigate,useLocation=()=>({pathname:'/testing/sheet-editor'});
 export const calls=[];export let saveImpl,loadImpl,actionImpl;
 export const saveStudioDraft=(...args)=>{calls.push(['save',...args]);return saveImpl(...args);};
 export const getMelody=id=>{calls.push(['load',id]);return loadImpl(id);};
 export const melodyAction=(...args)=>{calls.push(['action',...args]);return actionImpl(...args);};
 export const melodyError=issue=>issue.message??issue.code??'Request failed';
 export function reset(){search=new URLSearchParams();calls.length=0;saveImpl=()=>Promise.reject({message:'Offline'});loadImpl=()=>Promise.reject({code:'PGRST116'});actionImpl=()=>Promise.resolve();}
 export function setup(value){if(value.search!==undefined)search=new URLSearchParams(value.search);if(value.save)saveImpl=value.save;if(value.load)loadImpl=value.load;}
`),api=await import(apiUrl);
const {useMelodyStudio}=await import(await sourceUrl('src/components/testing/sheet-editor/useMelodyStudio.ts',{
 react:hostUrl,'react-router-dom':apiUrl,'../../brodle/services/melodyService':apiUrl,'./studioDocument':studioUrl,'./studioService':apiUrl,
}));
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function mount(t,{search='',storage=new Map(),owner='alice',save,load}={}){
 host.reset();api.reset();api.setup({search,save,load});
 const old=new Map(['localStorage','window','setInterval','clearInterval'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),timers=new Map();let nextTimer=0;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}});
 Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
 Object.defineProperty(globalThis,'setInterval',{configurable:true,value:(fn,ms)=>{assert.equal(ms,5000);timers.set(++nextTimer,fn);return nextTimer;}});
 Object.defineProperty(globalThis,'clearInterval',{configurable:true,value:id=>timers.delete(id)});
 let value;
 const render=()=>{for(let i=0;i<15;i++){host.begin();value=useMelodyStudio(owner);host.flush();if(!host.dirty)return value;}assert.fail('Studio hook did not settle');};
 const flush=async()=>{for(let i=0;i<8;i++){await Promise.resolve();render();}return value;};
 t.after(()=>{host.reset();for(const [key,descriptor]of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 render();return {get value(){return value;},render,flush,storage,replay:()=>{host.replayEffects();render();},tick:()=>{for(const fn of timers.values())fn();},edit:next=>{value.updateDraft(previous=>({...previous,...next}));render();}};
}
const rowFor=(id,draft,stamp='2026-11-25T12:00:00.000Z',extra={})=>({id,created_by:'alice',status:'draft',review_note:'',updated_at:stamp,...studio.studioPayload(draft),...extra});
test('new-melody links are consumed so guest edits restore on refresh',async t=>{
 const storage=new Map();
 await t.test('create and edit',async child=>{
  const page=mount(child,{owner:null,search:'new=1',storage});await page.flush();
  assert.equal(api.search.has('new'),false,'the one-time action must be removed before refresh');
  page.edit({title:'Keep this new melody'});await page.flush();
  assert.equal(api.calls.some(call=>call[0]==='save'),false);
 });
 await t.test('reload',async child=>{
  const page=mount(child,{owner:null,storage});await page.flush();
  assert.equal(page.value.draft.title,'Keep this new melody');
 });
});
test('blank drafts do not create rows; local backup is immediate and account autosave runs every five seconds',async t=>{
 const page=mount(t,{save:async(id,stamp,draft)=>rowFor(id,draft)});await page.flush();page.tick();await page.flush();assert.equal(api.calls.filter(c=>c[0]==='save').length,0);
 page.edit({title:'My tune',source:'Artist'});assert.ok([...page.storage.values()].some(raw=>raw.includes('My tune')));assert.equal(page.value.dirty,true);
 page.tick();await page.flush();assert.equal(api.calls.filter(c=>c[0]==='save').length,1);assert.equal(page.value.record.title,'My tune');assert.equal(page.value.dirty,false);assert.equal(api.search.get('id'),page.value.id);
 page.tick();await page.flush();assert.equal(api.calls.filter(c=>c[0]==='save').length,1);
});
test('edits during an in-flight save remain dirty and the next save uses the returned concurrency token',async t=>{
 const first=defer();let count=0;
 const page=mount(t,{save:async(id,stamp,draft)=>++count===1?first.promise:rowFor(id,draft,'2026-11-25T12:00:05.000Z')});await page.flush();page.edit({title:'First'});page.tick();page.render();assert.equal(page.value.saving,true);
 const call=api.calls.find(c=>c[0]==='save');page.edit({title:'Second'});page.tick();assert.equal(count,1);first.resolve(rowFor(call[1],call[3]));await page.flush();assert.equal(page.value.draft.title,'Second');assert.equal(page.value.dirty,true);
 page.tick();await page.flush();const saves=api.calls.filter(c=>c[0]==='save');assert.equal(saves.length,2);assert.equal(saves[1][2],'2026-11-25T12:00:00.000Z');assert.equal(saves[1][3].title,'Second');assert.equal(page.value.dirty,false);
});
test('network errors retain the same stable id and full local draft for an idempotent retry',async t=>{
 const page=mount(t);await page.flush();page.edit({title:'Offline tune'});const id=page.value.id;page.tick();await page.flush();assert.equal(page.value.error,'Offline');assert.equal(page.value.draft.title,'Offline tune');assert.equal(page.value.dirty,true);
 api.setup({save:async(key,stamp,draft)=>rowFor(key,draft)});page.tick();await page.flush();assert.equal(page.value.id,id);assert.equal(page.value.dirty,false);assert.equal(page.value.error,'');
});
test('cloud loading cannot be overwritten by an empty editor; a returned review reopens the exact two scores',async t=>{
 const pending=defer(),draft=studio.emptyStudioDraft();draft.title='Returned tune';draft.document.final.codeDraft='unfinished ending';
 const page=mount(t,{search:'id=existing',load:()=>pending.promise});assert.equal(page.value.loading,true);page.edit({title:'Should not replace'});page.tick();assert.equal(api.calls.some(c=>c[0]==='save'),false);
 pending.resolve(rowFor('existing',draft,undefined,{status:'rejected',review_note:'Change the ending'}));await page.flush();assert.equal(page.value.draft.title,'Returned tune');assert.equal(page.value.draft.document.final.codeDraft,'unfinished ending');assert.equal(page.value.record.review_note,'Change the ending');assert.equal(page.value.locked,false);page.tick();await page.flush();assert.equal(api.calls.some(c=>c[0]==='save'),false);
});
test('submitted originals are locked and conflict errors pause autosaving until an explicit editable copy',async t=>{
 const draft=studio.emptyStudioDraft();draft.title='Saved tune';
 const page=mount(t,{search:'id=existing',load:async()=>rowFor('existing',draft,undefined,{status:'submitted'})});await page.flush();assert.equal(page.value.locked,true);page.edit({title:'Blocked'});assert.equal(page.value.draft.title,'Saved tune');page.tick();assert.equal(api.calls.some(c=>c[0]==='save'),false);
 page.value.makeCopy();page.render();assert.equal(page.value.locked,false);assert.equal(page.value.draft.title,'Saved tune (copy)');assert.notEqual(page.value.id,'existing');
 api.setup({save:()=>Promise.reject({message:'brodle_studio_conflict'})});page.tick();await page.flush();assert.equal(page.value.conflict,true);const count=api.calls.length;page.tick();await page.flush();assert.equal(api.calls.length,count);
});
test('account-local pending work restores after refresh and detects a newer device without overwriting it',async t=>{
 const draft=studio.emptyStudioDraft();draft.title='Local work';const saved=studio.emptyStudioDraft();saved.title='Original';const storage=new Map([['brodle.studio.v1:alice:last','existing'],['brodle.studio.v1:alice:existing',JSON.stringify({id:'existing',draft,expected:'old',saved:JSON.stringify(saved)})]]);
 const remote={...saved,title:'Other device'};const page=mount(t,{storage,load:async()=>rowFor('existing',remote)});await page.flush();assert.equal(page.value.conflict,true);assert.equal(page.value.draft.title,'Local work');page.tick();assert.equal(api.calls.some(c=>c[0]==='save'),false);
 page.value.reload();await page.flush();assert.equal(page.value.conflict,false);assert.equal(page.value.draft.title,'Other device');
});
test('unmount ignores late results and clears the autosave interval',async t=>{
 const pending=defer(),page=mount(t,{save:()=>pending.promise});await page.flush();page.edit({title:'Before leaving'});page.tick();const call=api.calls.find(c=>c[0]==='save');host.reset();pending.resolve(rowFor(call[1],call[3]));await Promise.resolve();await Promise.resolve();assert.equal(api.search.get('id'),null);const count=api.calls.length;page.tick();assert.equal(api.calls.length,count);
});

test('Submit drains an earlier autosave, saves the latest two-score document, then locks the reviewed original',async t=>{
 const pending=defer();let count=0;const page=mount(t,{save:async(id,stamp,draft)=>++count===1?pending.promise:rowFor(id,draft,'2026-11-25T12:00:05.000Z')});await page.flush();
 const draft=studio.emptyStudioDraft();draft.title='Ready';delete draft.document.main.notation;draft.document.main.score=draft.document.main.score.replace('"midi":null','"midi":60');page.edit(draft);assert.equal(page.value.issue,'');page.tick();page.render();const call=api.calls.find(c=>c[0]==='save');
 page.edit({source:'Latest artist'});const submitted=page.value.submit();page.render();assert.equal(page.value.submitting,true);pending.resolve(rowFor(call[1],call[3]));await page.flush();await submitted;await page.flush();
 const saves=api.calls.filter(c=>c[0]==='save');assert.equal(saves.length,2);assert.equal(saves[1][3].source,'Latest artist');assert.equal(api.calls.filter(c=>c[0]==='action').length,1);assert.equal(page.value.record.status,'submitted');assert.equal(page.value.locked,true);assert.equal(page.value.dirty,false);
});
test('guest drafts stay local, and another account never inherits the previous account recovery',async t=>{
 const draft=studio.emptyStudioDraft();draft.title='Alice private tune';const storage=new Map([['brodle.studio.v1:alice:last','alice-work'],['brodle.studio.v1:alice:alice-work',JSON.stringify({id:'alice-work',draft,expected:null,saved:''})]]);
 const page=mount(t,{storage,owner:null});await page.flush();assert.equal(page.value.draft.title,'');page.edit({title:'Guest tune'});page.tick();await page.flush();assert.equal(api.calls.some(c=>c[0]==='save'),false);assert.equal(JSON.parse(storage.get('brodle.studio.v1:alice:alice-work')).draft.title,'Alice private tune');
});
test('damaged browser recovery is reported and its original bytes remain backed up',async t=>{
 const storage=new Map([['brodle.studio.v1:alice:last','broken'],['brodle.studio.v1:alice:broken','not json']]);const page=mount(t,{storage});await page.flush();assert.match(page.value.error,/could not be restored/);assert.equal(storage.get('brodle.studio.v1:alice:broken:unreadable'),'not json');page.tick();await page.flush();assert.equal(api.calls.some(c=>c[0]==='save'),false);
});


test('StrictMode effect replay restarts an invalidated load and only the current request ends loading',async t=>{
 const requests=[],draft=studio.emptyStudioDraft();draft.title='Strict replay tune';
 const page=mount(t,{search:'id=existing',load:()=>{const pending=defer();requests.push(pending);return pending.promise;}});
 assert.equal(page.value.loading,true);assert.equal(requests.length,1);page.replay();assert.equal(requests.length,2,'effect replay must restart the invalidated request');
 requests[0].resolve(rowFor('existing',{...draft,title:'Stale result'}));await page.flush();assert.equal(page.value.loading,true);
 requests[1].resolve(rowFor('existing',draft));await page.flush();assert.equal(page.value.loading,false);assert.equal(page.value.draft.title,'Strict replay tune');
});
