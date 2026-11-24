import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoutesFromElements, Routes, StaticRouter, useRoutes } from 'react-router-dom';
import ts from 'typescript';
import { previewUrl,expressionsUrl,playbackUrl,rhythmUrl,codeUrl as expressionCodeUrl,scoreUrl, musicUrl, modelUrl, codeUrl, parserUrl, codeEditorUrl } from './sheetEditorModules.mjs';

async function sourceUrl(path, imports = {}) {
  const source = await readFile(new URL('../../' + path, import.meta.url), 'utf8');
  let js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText.replace(/^import ['"].*\.css['"];?\s*$/gm, '');
  for (const [name, url] of Object.entries({
    react: import.meta.resolve('react'),
    'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
    'react-router-dom': import.meta.resolve('react-router-dom'),
    ...imports,
  })) js = js.replaceAll(`from "${name}"`, `from '${url}'`).replaceAll(`from '${name}'`, `from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const stateUrl = moduleUrl(`
  export const state = { auth: { user: null, loading: false }, admin: { admin: false, loading: false, error: null } };
  export const useAuth = () => state.auth;
  export const useBrodleAdmin = () => state.admin;
  export const usePianoAudio = () => ({});
  export function AuthProvider({children}) { return children; }
  export default function Passthrough({children}) { return children ?? null; }
  export function listMelodies() { throw new Error('Unexpected data request'); }
  export function deleteMelody() { throw new Error('Unexpected mutation'); }
  export function melodyAction() { throw new Error('Unexpected mutation'); }
  export const melodyError = () => 'Request failed';
`);
const { state } = await import(stateUrl);
const accessUrl = await sourceUrl('src/components/testing/TestingAccess.tsx', {
  '../../auth/authContext': stateUrl,
  '../brodle/hooks/useBrodleAdmin': stateUrl,
});
const { default: TestingAccess } = await import(accessUrl);
const { default: Testing } = await import(await sourceUrl('src/components/testing/Testing.tsx'));
const { default: TestingNotFound } = await import(await sourceUrl('src/components/testing/TestingNotFound.tsx'));
const { default: SheetEditor } = await import(await sourceUrl('src/components/testing/sheet-editor/SheetEditor.tsx', {
  '../../brodle/components/RhythmSymbol': stateUrl,
  '../../brodle/components/BrodleIcon': stateUrl,
  '../../brodle/hooks/usePianoAudio': stateUrl,
  './sheetEditorExpressions':expressionsUrl,'./ClefChoices':stateUrl,'./NotationPreview':stateUrl,'./sheetEditorPreview':previewUrl, './EditableStaff': stateUrl,
  './sheetEditorModel': modelUrl, './scoreModel':scoreUrl, './sheetEditorRhythm':rhythmUrl, './sheetEditorPlayback':playbackUrl, '../../brodle/lib/musicGame':musicUrl,
  './sheetEditorCode': codeUrl,
  './sheetEditorCodeParser': parserUrl,
  './SheetCodeEditor': codeEditorUrl,
}));
const { default: App } = await import(await sourceUrl('src/App.tsx', {
  './components/home/Home': stateUrl,
  './auth/AuthProvider': stateUrl,
  './components/layout/SiteLayout': stateUrl,
  './components/testing/TestingAccess': accessUrl,
}));

// Read the real App route declarations without rendering its providers or unrelated pages.
function find(node, type) {
  if (!node) return null;
  if (node.type === type) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const found = find(child, type);
    if (found) return found;
  }
  return null;
}
const routes = createRoutesFromElements(find(App(), Routes).props.children);
const testingRoute = routes.find(route => route.path === '/testing');
assert.equal(testingRoute?.element.type, TestingAccess);
let protectedRenders = 0;
function ProtectedHub() { protectedRenders++; return React.createElement(Testing); }
function ProtectedFallback() { protectedRenders++; return React.createElement(TestingNotFound); }
function ProtectedProbe() { protectedRenders++; return React.createElement('p', null, 'Protected experiment'); }
function ProtectedEditor() { protectedRenders++; return React.createElement(SheetEditor); }
const guardedRoutes = [{ ...testingRoute, children: [
  ...testingRoute.children.map(route => ({ ...route, element: React.createElement(route.index ? ProtectedHub : route.path === 'sheet-editor' ? ProtectedEditor : ProtectedFallback) })),
  { path: 'probe', element: React.createElement(ProtectedProbe) },
] }];
function MatchedRoutes() { return useRoutes(guardedRoutes); }
function render(path = '/testing') {
  protectedRenders = 0;
  return renderToStaticMarkup(React.createElement(StaticRouter, { location: path }, React.createElement(MatchedRoutes)));
}
const confirmedAdmin = { id: 'admin', email_confirmed_at: '2026-11-15T00:00:00Z' };
function access(user, admin = false, loading = false, error = null, authLoading = false) {
  state.auth = { user, loading: authLoading };
  state.admin = { admin, loading, error };
}

test('the real testing routes expose the experiment hub only to authorized accounts', () => {
  access(confirmedAdmin, true);
  for (const path of ['/testing', '/testing/']) {
    const html = render(path);
    assert.match(html, /<h1>Testing<\/h1>/);
    assert.match(html, /Try new features and experiments here/);
    assert.match(html, /Melody editor/);
    assert.match(html, /href="\/testing\/sheet-editor"/);
    assert.doesNotMatch(html, /http-equiv|Administrator access required|No experiments are available yet/);
    assert.equal(protectedRenders, 1);
  }
});

test('guest direct visits never render hub, unknown-page content, or a future experiment', () => {
  access(null);
  for (const path of ['/testing', '/testing/', '/testing/unknown', '/testing/probe', '/testing/sheet-editor']) {
    const html = render(path);
    assert.match(html, /Administrator access required/);
    assert.match(html, /href="\/login\?next=%2Ftesting"/);
    assert.match(html, /href="\/"/);
    assert.equal(protectedRenders, 0);
  }
});

test('ordinary accounts are denied on every testing route', () => {
  access({ id: 'ordinary' });
  for (const path of ['/testing', '/testing/unknown', '/testing/probe', '/testing/sheet-editor']) {
    const html = render(path);
    assert.match(html, /Administrator access required/);
    assert.doesNotMatch(html, /Log in|No experiments|Protected experiment|page not found/);
    assert.equal(protectedRenders, 0);
  }
});

test('auth restoration, pending access, and errors cannot mount protected children', () => {
  for (const authLoading of [true, false]) {
    access(confirmedAdmin, true, !authLoading, null, authLoading);
    assert.match(render('/testing/probe'), /role="status"/);
    assert.equal(protectedRenders, 0);
  }
  access(confirmedAdmin, true, false, 'An access check failed');
  assert.match(render('/testing/probe'), /role="alert"/);
  assert.equal(protectedRenders, 0, 'even a positive flag cannot override an access error');
  access(confirmedAdmin, true);
  assert.match(render('/testing/probe'), /Protected experiment/);
  assert.equal(protectedRenders, 1);
});

test('sign-out removes access even if an old admin flag remains in flight', () => {
  access(confirmedAdmin, true);
  assert.match(render(), /Melody editor/);
  access(null, true);
  assert.match(render(), /Log in/);
  assert.equal(protectedRenders, 0);
});

test('the real sheet-editor child is authorized before the editor mounts', () => {
  assert.ok(testingRoute.children.some(route => route.path === 'sheet-editor'));
  access(confirmedAdmin, true);
  const html = render('/testing/sheet-editor');
  assert.match(html, /<h1>Melody editor<\/h1>/);
  assert.match(html, /href="\/testing"/);
  assert.equal(protectedRenders, 1);
  for (const [user, admin, loading, error] of [
    [confirmedAdmin, true, true, null], [confirmedAdmin, true, false, 'RPC failure'],
    [null, true, false, null], [{ id: 'ordinary' }, false, false, null],
  ]) {
    access(user, admin, loading, error);
    assert.doesNotMatch(render('/testing/sheet-editor'), /No piano required/);
    assert.equal(protectedRenders, 0);
  }
});

test('unknown testing URLs show a protected fallback with a hub link for admins', () => {
  access(confirmedAdmin, true);
  const html = render('/testing/unknown/nested');
  assert.match(html, /Testing page not found/);
  assert.match(html, /href="\/testing"/);
  assert.equal(protectedRenders, 1);
});

const { default: BrodleAdmin } = await import(await sourceUrl('src/components/brodle/admin/BrodleAdmin.tsx', {
  '../../../auth/authContext': stateUrl,
  '../hooks/useBrodleAdmin': stateUrl,
  '../hooks/usePianoAudio': stateUrl,
  '../services/melodyService': stateUrl,
  '../library/LibraryShell': stateUrl,
  '../library/MelodyCard': stateUrl,
  '../components/PianoControls': stateUrl,
  './ChallengeCalendar': stateUrl,
  '../components/BrodleIcon': stateUrl,
}));
test('Manage Brodle offers the testing entry only inside authorized content', () => {
  for (const [user, admin, loading, visible] of [
    [null, false, false, false],
    [{ id: 'ordinary' }, false, false, false],
    [confirmedAdmin, false, true, false],
    [confirmedAdmin, true, false, true],
  ]) {
    access(user, admin, loading);
    const html = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/brodle/admin' }, React.createElement(BrodleAdmin)));
    assert.equal(html.includes('href="/testing"'), visible);
  }
});
