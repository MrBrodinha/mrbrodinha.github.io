import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(source, imports = {}) {
  let js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  for (const [name, url] of Object.entries(imports)) js = js.replaceAll(`from "${name}"`, `from '${url}'`).replaceAll(`from '${name}'`, `from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
const source = path => readFile(new URL('../../src/components/brodle/' + path, import.meta.url), 'utf8');
const musicUrl = moduleUrl(await source('lib/musicGame.ts'));
const progressUrl = moduleUrl(await source('lib/gameProgress.ts'), { './musicGame': musicUrl });
const lessonsUrl = moduleUrl(await source('lib/practiceLessons.ts'), { './musicGame': musicUrl, './gameProgress': progressUrl });
const { PRACTICE_LESSONS, practiceProgress, submitPracticeGuess } = await import(lessonsUrl);
const { emptyProgress, editProgressGuess, replaceGuessNote, winningAttempt, guessRangeIssues, noteConstraints, revealNextHint } = await import(progressUrl);

test('the feedback lesson starts with two fixable mistakes and confirmed green notes', () => {
  const lesson = PRACTICE_LESSONS[1];
  let progress = practiceProgress(lesson);
  assert.deepEqual(progress.guess, [72, 73, 78, 77]);
  assert.deepEqual(progress.attempts[0].feedback, ['correct', 'low', 'high', 'correct']);
  assert.deepEqual(guessRangeIssues(progress, lesson.target), [1, 2]);
  assert.equal(noteConstraints(progress, lesson.target)[0].lockedMidi, 72);
  assert.equal(noteConstraints(progress, lesson.target)[3].lockedMidi, 77);
  assert.equal(submitPracticeGuess(progress, lesson), progress, 'the copied mistakes must be fixed before submitting');
  progress = replaceGuessNote(progress, 1, 74, lesson.target);
  progress = replaceGuessNote(progress, 2, 76, lesson.target);
  progress = submitPracticeGuess(progress, lesson);
  assert.equal(winningAttempt(progress, lesson.target).kind, 'exact');
  assert.equal(progress.attempts.length, 2);
  assert.equal(submitPracticeGuess(progress, lesson), progress, 'a solved lesson cannot submit again');
});

test('practice starts fresh and uses the normal hint and feedback rules', () => {
  const lesson = PRACTICE_LESSONS[2];
  assert.deepEqual(practiceProgress(lesson), emptyProgress());
  let progress = revealNextHint(practiceProgress(lesson), lesson.target);
  progress = editProgressGuess(progress, [72, 75, 74, 73], lesson.target);
  progress = submitPracticeGuess(progress, lesson);
  assert.equal(progress.attempts[0].hintsUsed, 1);
  assert.deepEqual(progress.guess, [72], 'submitting keeps the revealed note in the fresh draft');
  assert.deepEqual(progress.attempts[0].feedback, ['correct', 'low', 'correct', 'high']);
  assert.deepEqual(practiceProgress(lesson), emptyProgress(), 'restarting creates a fresh local round');
});

const hostUrl = moduleUrl(`
  let slots = [], cursor = 0;
  export const audio = { playing: null, pressedNotes: new Set(), soundStatus: 'ready', calls: [],
    playNotes(notes, id) { this.playing = id; this.calls.push({ notes: [...notes], id }); return Promise.resolve(); } };
  audio.stopAudio = () => { audio.playing = null; };
  export function reset() { slots = []; audio.calls = []; audio.playing = null; }
  export function begin() { cursor = 0; }
  export function useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
  }
  export const useMemo = fn => fn();
  export function useRef(current) { const index = cursor++; return slots[index] ??= { current }; }
  export function useEffect() {}
  export const usePianoAudio = () => audio;
  export function Link() {}
  export default function Child() {}
`);
const host = await import(hostUrl);
const componentSource = (await source('BrodlePractice.tsx')).replace(/^import ['"].*\.css['"];$/gm, '');
const imports = Object.fromEntries([
  'react', 'react-router-dom', './components/BrodleIcon', './components/SheetMusic', './components/PianoKeyboard',
  './components/PianoControls', './components/AttemptHistory', './components/FeedbackLegend', './hooks/usePianoAudio',
].map(name => [name, hostUrl]));
Object.assign(imports, { './lib/gameProgress': progressUrl, './lib/musicGame': musicUrl, './lib/practiceLessons': lessonsUrl,
  './lib/feedback': moduleUrl(await source('lib/feedback.ts')),
  'react/jsx-runtime': import.meta.resolve('react/jsx-runtime') });
const { default: BrodlePractice } = await import(moduleUrl(componentSource, imports));
const flatten = node => Array.isArray(node) ? node.flatMap(flatten)
  : node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';

test('players can complete and restart all three lessons without touching saved progress', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { assert.fail('practice must not access saved progress'); } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; });
  host.reset();
  const render = () => { host.begin(); return flatten(BrodlePractice()); };
  let elements = render();
  const button = label => elements.find(node => node.type === 'button' && text(node).startsWith(label));
  const piano = () => elements.find(node => node.props.onNote && node.props.octaveNavigation);
  button('Play song').props.onClick();
  assert.deepEqual(host.audio.calls.at(-1).notes, [72, 74, 76, 77]);
  for (const pitch of PRACTICE_LESSONS[0].target) {
    piano().props.onNote(pitch);
    elements = render();
  }
  assert.equal(button('Submit').props.disabled, false);
  button('Submit').props.onClick();
  elements = render();
  assert.ok(elements.some(node => node.props.id === 'practice-success-title'));
  button('Next lesson').props.onClick();
  elements = render();
  let score = elements.find(node => node.props.abc);
  assert.deepEqual(score.props.feedback, ['correct', 'low', 'high', 'correct']);
  assert.equal(score.props.selection.selected.index, 1);
  piano().props.onNote(74);
  elements = render();
  score = elements.find(node => node.props.abc);
  assert.equal(score.props.selection.selected.index, 2);
  piano().props.onNote(76);
  elements = render();
  assert.equal(button('Submit').props.disabled, false);
  button('Submit').props.onClick();
  elements = render();
  button('Next lesson').props.onClick();
  elements = render();
  assert.ok(!elements.some(node => node.props.className === 'practice-note-pattern'), 'the final lesson hides its note names');
  button('Add note').props.onClick();
  elements = render();
  button('Add note').props.onClick();
  elements = render();
  assert.equal(button('Add note').props.disabled, true);
  for (const pitch of [74, 72]) { piano().props.onNote(pitch); elements = render(); }
  button('Submit').props.onClick();
  elements = render();
  assert.ok(elements.some(node => node.props.to === '/brodle' && text(node).startsWith('Play the daily puzzle')));
  button('Restart lesson').props.onClick();
  elements = render();
  assert.equal(elements.find(node => node.props.abc).props.feedback.length, 0);
  assert.equal(button('Submit').props.disabled, true);
});
