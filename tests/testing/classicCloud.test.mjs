import assert from 'node:assert/strict';
import test from 'node:test';
import { hookHostUrl, moduleUrl, sourceUrl, composerUrl } from './sheetEditorModules.mjs';
import { libraryUrl } from './studioModules.mjs';

const hostUrl = hookHostUrl('classic editor navigation'), host = await import(hostUrl);
const hooksUrl = moduleUrl(`export * from '${hostUrl}';export {useEffect as useLayoutEffect} from '${hostUrl}';`);
const boundaryUrl = moduleUrl(`
  export const fixture={search:new URLSearchParams(),urls:[]};
  export const useLocation=()=>({pathname:'/brodle/create/classic'});
  export const useSearchParams=()=>[fixture.search];
  export const useNavigate=()=>navigate;
  function navigate(url){fixture.urls.push(url);fixture.search=new URLSearchParams(url.split('?')[1]??'');}
  export const useAuth=()=>({user:{id:'author'}}),useBrodleAdmin=()=>({admin:false});
  export const saveMelody=async()=>({id:'saved',created_by:'author',status:'draft'});
  export const getMelody=async()=>{throw new Error('Unexpected load');};
  export const melodyAction=async()=>{},melodyError=()=>'';
`);
const { fixture } = await import(boundaryUrl), { emptyComposerDraft } = await import(composerUrl);
const { useStudioCloud } = await import(await sourceUrl('src/components/brodle/creator/useStudioCloud.ts', {
  react: hooksUrl, 'react-router-dom': boundaryUrl, '../../../auth/authContext': boundaryUrl,
  '../hooks/useBrodleAdmin': boundaryUrl, '../lib/melodyLibrary': libraryUrl, '../services/melodyService': boundaryUrl, './melodyComposer': composerUrl,
}));
test('classic editor save, copy and new actions stay on the compatibility route', async t => {
  host.reset(); t.after(() => host.reset()); fixture.search = new URLSearchParams(); fixture.urls.length = 0;
  let draft = emptyComposerDraft(), cloud;
  const update = value => { draft = typeof value === 'function' ? value(draft) : value; }, stop = () => {};
  const render = () => { host.begin(); cloud = useStudioCloud(draft, update, stop); host.flush(); return cloud; };
  render(); await cloud.run('save'); render();
  assert.equal(fixture.urls.at(-1), '/brodle/create/classic?id=saved');
  cloud.makeCopy(); assert.equal(fixture.urls.at(-1), '/brodle/create/classic?copy=saved');
  cloud.newDraft(); assert.equal(fixture.urls.at(-1), '/brodle/create/classic?new=1');
  render(); assert.equal(fixture.urls.at(-1), '/brodle/create/classic');
});
