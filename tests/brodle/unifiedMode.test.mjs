import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

async function sourceUrl(path, imports = {}, transform = source => source) {
  const source = transform(await readFile(new URL('../../src/components/brodle/' + path, import.meta.url), 'utf8'));
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const [name, url] of Object.entries({ react: import.meta.resolve('react'), 'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'), ...imports })) {
    js = js.replaceAll(`from '${name}'`, `from '${url}'`).replaceAll(`from "${name}"`, `from '${url}'`);
  }
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const musicUrl = await sourceUrl('lib/musicGame.ts');
const progressUrl = await sourceUrl('lib/gameProgress.ts', { './musicGame': musicUrl });
const { scoreGuess, buildShareText } = await import(musicUrl);
const { emptyProgress, parseProgress, serializeProgress, isFinished } = await import(progressUrl);
const noticeUrl = await sourceUrl('components/MelodyPitchNotice.tsx', { '../lib/musicGame': musicUrl });
const { default: MelodyPitchNotice } = await import(noticeUrl);
const dummyUrl = dataUrl(`import { jsx } from '${import.meta.resolve('react/jsx-runtime')}'; export default function Sheet(props) { return jsx('div', { 'data-sheet': props.abc ? true : undefined, 'aria-label': props.label }); }`);
const { default: SheetStub } = await import(dummyUrl);
const historyUrl = await sourceUrl('components/AttemptHistory.tsx', {
  '../lib/musicGame': musicUrl, '../lib/feedback': await sourceUrl('lib/feedback.ts'),
  './MelodyPitchNotice': noticeUrl, './SheetMusic': dummyUrl, './BrodleIcon': dummyUrl, './FeedbackLegend': dummyUrl,
});
const { default: AttemptHistory } = await import(historyUrl);
const target = [60,64,67];
const melody = target.map(midi => ({ midi, beats: 1, length: '1', rhythm: 'Quarter note' }));

test('pitch notices render accessible text for the displayed melody, and disappear on edits', () => {
  const render = notes => renderToStaticMarkup(createElement(MelodyPitchNotice, { notes, target }));
  for (const offset of [-24,-12,-5,-1,1,5,12,24]) {
    const markup = render(target.map(midi => midi + offset));
    assert.match(markup, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.match(markup, /Right melody/);
    assert.match(markup, offset < 0 ? /higher/ : /lower/);
    assert.equal(markup.includes('different octave'), offset % 12 === 0);
    if (Math.abs(offset) === 24) assert.match(markup, /2 octaves/);
  }
  for (const notes of [[], [62,66], target, [61,64,68], [72,64,79]]) assert.doesNotMatch(render(notes), /melody-pitch-notice|Right melody/);
});

test('history places guidance above the selected sheet, including older attempts after a win', () => {
  const attempts = [[62,66,69], [48,52,55], target].map(notes => ({ notes, feedback: scoreGuess(notes, target) }));
  const render = selectedIndex => renderToStaticMarkup(createElement(AttemptHistory, {
    attempts, selectedIndex, melody, musicalKey: 'C', naming: 'letters', timeSignature: '4/4', bpm: 120,
    playing: null, finished: true, onSelect() {}, onCopy() {}, onReplay() {},
  }));
  for (const [index, text] of [[0, /shifted pitch.*lower/], [1, /different octave.*higher/]]) {
    const markup = render(index);
    assert.match(markup, text);
    assert.ok(markup.indexOf('melody-pitch-notice') < markup.indexOf('data-sheet="true"'));
  }
  assert.doesNotMatch(render(2), /melody-pitch-notice/);
});

// Exercise the actual game handlers using the same lightweight hook-host pattern
// used by the component tests. Presentation children remain identifiable in the tree.
const hostUrl = dataUrl(`
  let slots = [], cursor = 0;
  export const state = { progress: null };
  export function begin() { cursor = 0; }
  export function reset(progress) { slots = []; state.progress = progress; audio.playing = null; audio.calls = []; }
  export function useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; }
  export const useMemo = fn => fn();
  export function useRef(current) { const index = cursor++; return slots[index] ??= { current }; }
  export function useEffect() {}
  export const useAuth = () => ({ user: null });
  export function useBrodleProgress() { return { progress: state.progress, updateProgress(update) { const previous = state.progress; state.progress = update(previous); return { previous, next: state.progress }; }, status: 'local', retrySync() {} }; }
  export const audio = { playing: null, pressedNotes: new Set(), soundStatus: 'ready', calls: [] };
  audio.stopAudio = () => { audio.playing = null; };
  audio.playNotes = async (notes, id) => { audio.calls.push({ notes, id }); audio.playing = id; };
  audio.playArrangement = async (parts, id) => { audio.calls.push({ parts, id }); audio.playing = id; };
  export const usePianoAudio = () => audio;
  export const displayDate = value => value;
  export const lisbonDate = () => '2026-11-24';
  export const useDailyChallenge = () => ({});
  export function useSearchParams() {}
  export function Link() {}
  export default function Child() {}
`);
const host = await import(hostUrl);
const gameImports = Object.fromEntries([
  'react', 'react-router-dom', '../../auth/authContext', './hooks/usePianoAudio', './hooks/useBrodleProgress', './hooks/useDailyChallenge', './lib/melodyLibrary',
  './components/WinConfetti', './components/BrodleIcon', './components/PianoKeyboard', './components/PianoControls', './components/BrodleTutorial',
  './components/MelodyDifficulty', './components/ChallengeNavigation',
].map(name => [name, hostUrl]));
Object.assign(gameImports, {
  './lib/musicGame': musicUrl, './lib/gameProgress': progressUrl,
  './lib/victoryMusic': await sourceUrl('lib/victoryMusic.ts', { './musicGame': musicUrl }),
  './lib/feedback': await sourceUrl('lib/feedback.ts'), './components/SheetMusic': dummyUrl,
  './components/MelodyPitchNotice': noticeUrl, './components/AttemptHistory': historyUrl,
});
const { Brodle } = await import(await sourceUrl('Brodle.tsx', gameImports, source => source.replace(/^import ['"].*\.css['"];$/gm, '').replace('function Brodle({', 'export function Brodle({')));
const challenge = { id: 'day-a', date: '2026-11-24', title: 'Fixture', source: '', melody, key: 'C', bpm: 120, timeSignature: '4/4', finalMelody: melody, finalBass: [{ midi: 36, beats: 3 }] };
const flatten = node => Array.isArray(node) ? node.flatMap(flatten) : node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
const render = () => { host.begin(); return flatten(Brodle({ challenge, notice: '', navigation: {} })); };
const button = (nodes, label) => nodes.find(node => node.type === 'button' && text(node).startsWith(label));

function globals(t, values) {
  const originals = new Map(Object.keys(values).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => { for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
}

test('unified game keeps shifted submissions editable, shows draft guidance and celebrates only exact success', t => {
  globals(t, { requestAnimationFrame: () => 1 });
  host.reset({ ...emptyProgress(), guess: [62,66,69] });
  let nodes = render();
  assert.equal(nodes.some(node => node.props['aria-label'] === 'Game mode'), false);
  assert.ok(button(nodes, 'Add note'));
  assert.ok(button(nodes, 'Play song'));
  assert.ok(nodes.some(node => node.type === MelodyPitchNotice && node.props.notes.join() === '62,66,69'));
  assert.ok(nodes.findIndex(node => node.type === MelodyPitchNotice) < nodes.findIndex(node => node.type === SheetStub));
  assert.equal(button(nodes, 'Submit').props.disabled, false);
  button(nodes, 'Submit').props.onClick();
  nodes = render();
  assert.equal(isFinished(host.state.progress), false);
  assert.ok(button(nodes, 'Submit'));
  assert.equal(host.audio.calls.some(call => call.id === 'final'), false);
  const history = nodes.find(node => node.type === AttemptHistory);
  history.props.onCopy(0);
  nodes = render();
  assert.deepEqual(host.state.progress.guess, [62,66,69]);
  // Reach the target through the real per-note editing callbacks.
  const sheet = nodes.find(node => node.type === SheetStub);
  sheet.props.selection.onSelect(0, 0);
  for (const pitch of target) {
    nodes = render();
    nodes.find(node => node.props.onNote).props.onNote(pitch);
  }
  nodes = render();
  assert.deepEqual(host.state.progress.guess, target);
  button(nodes, 'Submit').props.onClick();
  nodes = render();
  assert.equal(isFinished(host.state.progress), true);
  assert.equal(button(nodes, 'Submit'), undefined);
  assert.deepEqual(host.audio.calls.find(call => call.id === 'final').parts, [melody, challenge.finalBass]);
  assert.ok(nodes.some(node => node.props.variant === 'exact'));
});

test('native share, clipboard and manual fallback all include the same assistance, date and link', async t => {
  globals(t, { window: { location: { origin: 'https://example.com' } }, navigator: {} });
  const url = 'https://example.com/brodle?date=2026-11-24';
  for (const [noteHints, songHintUsed] of [[0,false], [1,false], [0,true], [1,true]]) {
    const progress = parseProgress(serializeProgress({ ...emptyProgress(), attempts: [{ id: 'won', notes: target, feedback: scoreGuess(target, target), hintsUsed: noteHints }], hintsUsed: noteHints, songHintUsed }), target);
    const expected = buildShareText(progress.attempts, target, url, noteHints, songHintUsed) + '\nChallenge: 2026-11-24';
    for (const method of ['native', 'clipboard', 'manual']) {
      host.reset(progress);
      let captured;
      globalThis.navigator = method === 'native' ? { share: async data => { captured = data.text; } }
        : method === 'clipboard' ? { share: async () => { throw Error('native unavailable'); }, clipboard: { writeText: async value => { captured = value; } } } : {};
      await render().find(node => node.props['aria-label'] === 'Share result').props.onClick();
      // The click intentionally starts an asynchronous handler; allow its fallback chain to settle.
      await new Promise(resolve => setImmediate(resolve));
      if (method === 'manual') captured = render().find(node => node.type === 'textarea').props.value;
      assert.equal(captured, expected);
      assert.doesNotMatch(captured, /Mode:|Casual|Hard/);
    }
  }
});

test('song listening records help independently; own playback and free play do not', () => {
  host.reset({ ...emptyProgress(), guess: [62] });
  let nodes = render();
  button(nodes, 'Listen').props.onClick();
  nodes.find(node => node.props.freePlay).props.freePlay.onToggle();
  assert.equal(host.state.progress.songHintUsed, undefined);
  button(nodes, 'Play song').props.onClick();
  assert.equal(host.state.progress.songHintUsed, true);
  assert.equal(host.state.progress.hintsUsed, 0);
  assert.deepEqual(host.state.progress.guess, [62]);
  nodes = render();
  button(nodes, 'Stop song').props.onClick();
  assert.equal(host.state.progress.songHintUsed, true);
  button(nodes, 'Add note').props.onClick();
  assert.equal(host.state.progress.hintsUsed, 1);
  assert.equal(host.state.progress.songHintUsed, true);
});

test('expressive tied melody wins by entering only the two attacked pitches',t=>{
 globals(t,{requestAnimationFrame:()=>1});
 const expressive=[{midi:60,beats:1,length:'1',rhythm:'Quarter',tieToNext:[60]},{midi:60,beats:1,length:'1',rhythm:'Quarter'},{midi:64,beats:2,length:'2',rhythm:'Half',staccato:true}];
 const round={...challenge,melody:expressive,finalMelody:expressive};host.reset(emptyProgress());
 const view=()=>{host.begin();return flatten(Brodle({challenge:round,notice:'',navigation:{}}));};
 let nodes=view();for(const pitch of [60,64]){nodes.find(node=>node.props.onNote).props.onNote(pitch);nodes=view();}
 assert.deepEqual(host.state.progress.guess,[60,64]);assert.equal(button(nodes,'Submit').props.disabled,false);
 const sheet=nodes.find(node=>node.type===SheetStub);assert.deepEqual(sheet.props.feedbackIndices,[0,0,1]);
 button(nodes,'Submit').props.onClick();nodes=view();assert.equal(isFinished(host.state.progress),true);assert.equal(button(nodes,'Submit'),undefined);
});
