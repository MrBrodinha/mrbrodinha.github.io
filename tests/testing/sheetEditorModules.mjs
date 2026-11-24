import { readFile } from 'node:fs/promises';
import ts from 'typescript';

export function moduleUrl(source, imports = {}) {
  let js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText.replace(/^import ['"].*\.css['"];?\s*$/gm, '');
  for (const [name, url] of Object.entries({
    react: import.meta.resolve('react'), 'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
    'react-router-dom': import.meta.resolve('react-router-dom'), abcjs: import.meta.resolve('abcjs'), ...imports,
  })) js = js.replaceAll(`from "${name}"`, `from '${url}'`).replaceAll(`from '${name}'`, `from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
export async function sourceUrl(path, imports = {}) {
  return moduleUrl(await readFile(new URL('../../' + path, import.meta.url), 'utf8'), imports);
}
export const musicUrl = await sourceUrl('src/components/brodle/lib/musicGame.ts');
export const victoryUrl = await sourceUrl('src/components/brodle/lib/victoryMusic.ts', { './musicGame': musicUrl });
const composerUrl = await sourceUrl('src/components/brodle/creator/melodyComposer.ts', {
  '../lib/musicGame': musicUrl, '../lib/victoryMusic': victoryUrl,
});
export const rhythmUrl=await sourceUrl('src/components/testing/sheet-editor/sheetEditorRhythm.ts');
export const rhythm=await import(rhythmUrl);
export const clefsUrl=await sourceUrl('src/components/testing/sheet-editor/sheetEditorClefs.ts');
export const modelUrl=await sourceUrl('src/components/testing/sheet-editor/sheetEditorModel.ts',{'./sheetEditorClefs':clefsUrl,'../../brodle/creator/melodyComposer':composerUrl,'./sheetEditorRhythm':rhythmUrl});
export const model=await import(modelUrl);
export const expressionsUrl=await sourceUrl('src/components/testing/sheet-editor/sheetEditorExpressions.ts',{'./sheetEditorModel':modelUrl,'./sheetEditorRhythm':rhythmUrl});
export const expressions=await import(expressionsUrl);
export const scoreUrl=await sourceUrl('src/components/testing/sheet-editor/scoreModel.ts',{'../../brodle/lib/musicGame':musicUrl,'./sheetEditorModel':modelUrl,'./sheetEditorExpressions':expressionsUrl});
export const scoreModel=await import(scoreUrl);
export const previewUrl=await sourceUrl('src/components/testing/sheet-editor/sheetEditorPreview.ts',{'./scoreModel':scoreUrl});
export const codeUrl=await sourceUrl('src/components/testing/sheet-editor/sheetEditorCode.ts',{'./sheetEditorModel':modelUrl});
export const {sheetEditorCode,codeSnapshot}=await import(codeUrl);
export const notationUrl=await sourceUrl('src/components/testing/sheet-editor/sheetEditorNotation.ts',{'../../brodle/lib/musicGame':musicUrl,'./sheetEditorModel':modelUrl,'./scoreModel':scoreUrl,'./sheetEditorCode':codeUrl});
export const notation=await import(notationUrl);
export const layoutUrl=await sourceUrl('src/components/testing/sheet-editor/sheetEditorLayout.ts',{'./sheetEditorModel':modelUrl,'./sheetEditorNotation':notationUrl});
export const layout=await import(layoutUrl);
export const parserUrl=await sourceUrl('src/components/testing/sheet-editor/sheetEditorCodeParser.ts',{'./sheetEditorModel':modelUrl,'./sheetEditorCode':codeUrl,'./scoreModel':scoreUrl,'../../brodle/lib/musicGame':musicUrl});
export const {parseSheetCode,linkedDraftRange}=await import(parserUrl);
export const playbackUrl=await sourceUrl('src/components/testing/sheet-editor/sheetEditorPlayback.ts',{'./sheetEditorModel':modelUrl});
export const playback=await import(playbackUrl);
export const codeEditorUrl=await sourceUrl('src/components/testing/sheet-editor/SheetCodeEditor.tsx',{'./sheetEditorCode':codeUrl});

// A small hook host, matching the repository's existing component tests. Real
// pointer layout, browser focus/scrolling, and audio still require browser QA.
export function hookHostUrl(name) {
  return moduleUrl(`
    // ${name}
    let slots = [], cursor = 0, effects = [];
    export let dirty = false;
    export function begin() { cursor = 0; effects = []; dirty = false; }
    export function flush() { effects.splice(0).forEach(effect => effect()); }
    export function reset() { slots.forEach(slot => slot?.cleanup?.()); slots = []; begin(); }
    export function useState(initial) {
      const index = cursor++, cell = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [cell.value, next => { const value = typeof next === 'function' ? next(cell.value) : next; if (!Object.is(cell.value, value)) { cell.value = value; dirty = true; } }];
    }
    export function useReducer(reducer, initial, init) {
      const [state, setState] = useState(() => init ? init(initial) : initial);
      return [state, action => setState(value => reducer(value, action))];
    }
    export function useRef(current) { return slots[cursor++] ??= { current }; }
    export function useMemo(fn, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) slots[index] = { value: fn(), deps };
      return slots[index].value;
    }
    export const useCallback = (fn, deps) => useMemo(() => fn, deps);
    export function useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
    }
  `);
}
export function flatten(node) {
  return Array.isArray(node) ? node.flatMap(flatten) : node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : [];
}
