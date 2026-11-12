import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText).toString('base64')}`;
const source = (path) => readFile(new URL('../../src/components/brodle/' + path, import.meta.url), 'utf8');
const musicUrl = moduleUrl(await source('lib/musicGame.ts'));
const victoryUrl = moduleUrl((await source('lib/victoryMusic.ts')).replace("from './musicGame'", `from '${musicUrl}'`));
const soundsUrl = moduleUrl((await source('lib/pianoSounds.ts'))
  .replace("from './musicGame'", `from '${musicUrl}'`)
  .replace("import('smplr')", `import('${import.meta.resolve('smplr')}')`));

// A single-mount hook host: run the real audio hook and its lifecycle handlers
// without a browser DOM. Audio scheduling and browser events are controlled below.
const hooksUrl = moduleUrl(`
  export const effects = [];
  export const states = [];
  export const useRef = (current) => ({ current });
  export const useCallback = (callback) => callback;
  export const useEffect = (effect) => { effects.push(effect); };
  export const useState = (initial) => {
    const value = typeof initial === 'function' ? initial() : initial;
    const state = { initial: value, value };
    states.push(state);
    return [value, (next) => { state.value = typeof next === 'function' ? next(state.value) : next; }];
  };
`);
const hooks = await import(hooksUrl);
const { usePianoAudio } = await import(moduleUrl((await source('hooks/usePianoAudio.ts'))
  .replace("from 'react'", `from '${hooksUrl}'`)
  .replace("from '../lib/musicGame'", `from '${musicUrl}'`)
  .replace("from '../lib/victoryMusic'", `from '${victoryUrl}'`)
  .replace("from '../lib/pianoSounds'", `from '${soundsUrl}'`)));

function mountAudio(t, initialContextState = 'running') {
  const contexts = [];
  const parameter = () => ({
    value: 0,
    setValueAtTime(value) { this.value = value; },
    linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
    cancelScheduledValues() {}, setTargetAtTime() {},
  });
  const node = () => ({ connect() {}, disconnect() {} });
  class AudioContext {
    state = initialContextState;
    currentTime = 0;
    destination = node();
    oscillators = [];
    resumeCalls = 0;
    constructor() { contexts.push(this); }
    createGain() { return { ...node(), gain: parameter() }; }
    createOscillator() {
      const oscillator = { ...node(), frequency: parameter(), starts: [], stops: [], start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); } };
      this.oscillators.push(oscillator);
      return oscillator;
    }
    async resume() { this.resumeCalls++; this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { hidden: false });
  const globals = { window, document, AudioContext, navigator: { userAgent: 'Android Mobile', platform: 'Linux', maxTouchPoints: 5 } };
  const originals = new Map(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
  hooks.states.length = 0;
  hooks.effects.length = 0;
  const audio = usePianoAudio();
  const cleanups = hooks.effects.map((effect) => effect());
  const unmount = () => cleanups.splice(0).reverse().forEach((cleanup) => cleanup?.());
  t.after(() => {
    unmount();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const playing = hooks.states.find((state) => state.initial === null);
  return { audio, contexts, window, document, playing, unmount };
}

const melody = [{ midi: 60, beats: 1 }, { midi: 64, beats: 1 }];

test('mobile audio is ready as Synth without creating an audio context or preloading samples', (t) => {
  const { audio, contexts } = mountAudio(t);
  assert.equal(audio.sound, 'synth');
  assert.equal(audio.soundStatus, 'ready');
  assert.equal(audio.usingSynthFallback, false);
  assert.equal(contexts.length, 0);
});

test('melodies and victory chords keep their scheduled voices when switching tabs or apps', async (t) => {
  const { audio, contexts, window, document, playing } = mountAudio(t);
  await audio.playArrangement([melody, [{ midi: 48, pitches: [48, 55], beats: 2 }]], 'background', 120);
  const context = contexts[0];
  assert.equal(context.oscillators.length, 4);
  const scheduledStops = context.oscillators.map((voice) => [...voice.stops]);
  window.dispatchEvent(new Event('blur'));
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(playing.value, 'background');
  assert.equal(context.state, 'running');
  assert.deepEqual(context.oscillators.map((voice) => voice.stops), scheduledStops);

  audio.stopAudio();
  assert.equal(playing.value, null);
  assert.ok(context.oscillators.every((voice) => voice.stops.at(-1) === undefined));
});

for (const event of ['blur', 'visibilitychange']) {
  test(`${event} releases held piano keys to avoid stuck notes`, async (t) => {
    const { audio, contexts, window, document } = mountAudio(t);
    await audio.startNote(60, 'pointer-1');
    const voice = contexts[0].oscillators[0];
    assert.equal(voice.stops.length, 0);
    if (event === 'blur') window.dispatchEvent(new Event(event));
    else { document.hidden = true; document.dispatchEvent(new Event(event)); }
    assert.deepEqual(voice.stops, [.09]);
    // Releasing the original pointer afterward must not release the key again.
    audio.releaseNote('pointer-1');
    assert.deepEqual(voice.stops, [.09]);
  });
}

test('focus loss cancels a piano key still waiting for audio to start', async (t) => {
  const { audio, contexts, window } = mountAudio(t);
  const pending = audio.startNote(60, 'keyboard-1-Enter');
  window.dispatchEvent(new Event('blur'));
  await pending;
  assert.equal(contexts[0].oscillators.length, 0);
});

test('playback completion follows the audio clock if the OS pauses background audio', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { audio, contexts, playing } = mountAudio(t);
  await audio.playMelody(melody, 'interrupted', 120);
  contexts[0].state = 'interrupted';
  t.mock.timers.tick(2000);
  assert.equal(playing.value, 'interrupted');
  contexts[0].state = 'running';
  contexts[0].currentTime = 1.1;
  t.mock.timers.tick(2000);
  assert.equal(playing.value, null);
});

test('playing after an audio interruption resumes the context', async (t) => {
  const { audio, contexts } = mountAudio(t, 'interrupted');
  await audio.playMelody(melody, 'resumed', 120);
  assert.equal(contexts[0].resumeCalls, 1);
  assert.equal(contexts[0].state, 'running');
  assert.equal(contexts[0].oscillators.length, 2);
});

test('extreme transposed victory pitches play exactly without folding into another octave', async (t) => {
  const { audio, contexts } = mountAudio(t);
  await audio.playArrangement([[{ midi: -17, beats: 1 }], [{ midi: 139, beats: 1 }]], 'final', 144);
  assert.deepEqual(contexts[0].oscillators.map((voice) => voice.frequency.value), [-17, 139].map((midi) => 440 * 2 ** ((midi - 69) / 12)));
});

test('returning to Brodle resumes a browser-interrupted melody without restarting it', async (t) => {
  const { audio, contexts, document, playing } = mountAudio(t);
  await audio.playMelody(melody, 'background', 120);
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  contexts[0].state = 'interrupted';
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(contexts[0].resumeCalls, 1);
  assert.equal(contexts[0].oscillators.length, 2);
  assert.equal(playing.value, 'background');
});

test('leaving Brodle still stops playback and closes its audio context', async (t) => {
  const { audio, contexts, playing, unmount } = mountAudio(t);
  await audio.playMelody(melody, 'navigation', 120);
  unmount();
  assert.equal(playing.value, null);
  assert.equal(contexts[0].state, 'closed');
  assert.ok(contexts[0].oscillators.every((voice) => voice.stops.at(-1) === undefined));
});

test('triplet playback schedules chords together, keeps rests and highlights, then stops on the audio clock', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { audio, contexts, playing } = mountAudio(t);
  const group = [{ midi: 60, pitches: [60,64,67], beats: 1, triplet: 1 }, { midi: null, beats: 1, triplet: 2 }, { midi: 62, pitches: [62,65], beats: 1, triplet: 3 }];
  await audio.playMelody(group, 'triplet', 120);
  const context = contexts[0];
  const starts = context.oscillators.map(voice => voice.starts[0]);
  assert.deepEqual(starts, [.03,.03,.03,.03 + 2/3,.03 + 2/3]);
  context.currentTime = .04;
  t.mock.timers.tick(40);
  const pressed = hooks.states.find(state => state.initial instanceof Set);
  assert.deepEqual([...pressed.value], [60,64,67]);
  context.currentTime = 1.04;
  t.mock.timers.tick(2000);
  assert.equal(playing.value, null);
  assert.equal(pressed.value.size, 0);

  await audio.playNotes([72,74], 'guess', group.map(({ midi, beats, triplet }) => ({ midi, beats, triplet })));
  assert.equal(context.oscillators.length, 7, 'guess playback substitutes pitches and preserves triplet timing');
  assert.deepEqual(context.oscillators.slice(-2).map(voice => voice.starts[0]), [1.07, 1.07 + 4/9]);
  audio.stopAudio();
  assert.equal(playing.value, null);
});
