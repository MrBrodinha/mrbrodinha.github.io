import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compilerOptions = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 };
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions }).outputText).toString('base64')}`;
const musicUrl = moduleUrl(await readFile(new URL('../../src/components/brodle/lib/musicGame.ts', import.meta.url), 'utf8'));
const soundSource = (await readFile(new URL('../../src/components/brodle/lib/pianoSounds.ts', import.meta.url), 'utf8'))
  .replace("from './musicGame'", `from '${musicUrl}'`)
  .replace("import('smplr')", `import('${import.meta.resolve('smplr')}')`);
const { createSampledPiano, defaultPianoSound } = await import(moduleUrl(soundSource));

test('phones and tablets default to Synth while desktops keep Grand piano', () => {
  const device = (userAgent, extra = {}) => ({ userAgent, platform: '', maxTouchPoints: 0, ...extra });
  for (const mobile of [
    device('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36'),
    device('Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/140.0 Safari/537.36'),
    device('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'),
    device('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'),
    device('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', { platform: 'MacIntel', maxTouchPoints: 5 }),
    device('Reduced browser identifier', { userAgentData: { mobile: true } }),
  ]) assert.equal(defaultPianoSound(mobile), 'synth');
  for (const desktop of [
    device('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', { maxTouchPoints: 10 }),
    device('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', { platform: 'MacIntel' }),
    device('Mozilla/5.0 (X11; Linux x86_64)', { userAgentData: { mobile: false } }),
  ]) assert.equal(defaultPianoSound(desktop), 'grand');
});

// Exercise the real smplr loader with controlled downloads and decoding.
function audioContext(decode = async () => ({ duration: 1 })) {
  const node = () => ({ gain: { value: 1 }, pan: { value: 0 }, connect() {}, disconnect() {} });
  return { state: 'running', destination: node(), createGain: node, createStereoPanner: node, decodeAudioData: decode };
}

test('a failed sample retries without downloading successful samples again', async (t) => {
  const downloads = new Map();
  let failedUrl;
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url) => {
    const count = (downloads.get(url) ?? 0) + 1;
    downloads.set(url, count);
    failedUrl ??= url;
    return { status: url === failedUrl && count === 1 ? 503 : 200, arrayBuffer: async () => new ArrayBuffer(1) };
  });
  const context = audioContext();
  const piano = await createSampledPiano(context, context.destination, 'grand', () => {});
  try {
    await piano.ready;
    assert.ok(downloads.size > 1);
    assert.equal(downloads.get(failedUrl), 2);
    assert.ok([...downloads].every(([url, count]) => count === (url === failedUrl ? 2 : 1)));
  } finally { piano.dispose(); }
});

test('a temporary decode failure recovers on the next load', async (t) => {
  let decodes = 0;
  let downloads = 0;
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () => {
    downloads++;
    return { status: 200, arrayBuffer: async () => new ArrayBuffer(1) };
  });
  const context = audioContext(async () => {
    if (++decodes === 1) throw new Error('Temporary decoder failure');
    return { duration: 1 };
  });
  const piano = await createSampledPiano(context, context.destination, 'grand', () => {});
  try {
    await piano.ready;
    assert.equal(decodes, downloads);
    assert.ok(decodes > 2);
  } finally { piano.dispose(); }
});

test('persistent download failures stop retrying and reject the instrument', async (t) => {
  const downloads = new Map();
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url) => {
    downloads.set(url, (downloads.get(url) ?? 0) + 1);
    return { status: 503 };
  });
  const context = audioContext();
  const piano = await createSampledPiano(context, context.destination, 'grand', () => {});
  try {
    await assert.rejects(piano.ready, /Some piano samples could not load/);
    assert.ok(downloads.size > 1);
    assert.ok([...downloads.values()].every((count) => count === 2));
  } finally { piano.dispose(); }
});
