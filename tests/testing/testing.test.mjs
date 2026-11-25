import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoutesFromElements, Routes, StaticRouter, useRoutes } from 'react-router-dom';
import ts from 'typescript';
import { libraryUrl, studioUrl, studio } from './studioModules.mjs';
import { composerUrl, previewUrl,expressionsUrl,playbackUrl,rhythmUrl,codeUrl as expressionCodeUrl,scoreUrl, musicUrl, modelUrl, codeUrl, parserUrl, codeEditorUrl, studioPianoUrl } from './sheetEditorModules.mjs';

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
  export const useMelodyStudio = () => ({ draft: ${JSON.stringify(studio.emptyStudioDraft())}, revision: 0, loading: false, locked: false, submitting: false, saving: false, dirty: false, record: null, error: '', localError: '', issue: 'Add a title before submitting.', updateDraft() {}, newDraft() {}, save() {}, submit() {}, makeCopy() {}, reload() {} });
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
const editorUrl = await sourceUrl('src/components/testing/sheet-editor/SheetEditor.tsx', {
  '../../brodle/components/RhythmSymbol': stateUrl,
  '../../brodle/components/BrodleIcon': stateUrl,
  '../../brodle/hooks/usePianoAudio': stateUrl,
  './sheetEditorExpressions':expressionsUrl,'./ClefChoices':stateUrl,'./NotationPreview':stateUrl,'./sheetEditorPreview':previewUrl, './EditableStaff': stateUrl,
  './sheetEditorModel': modelUrl, './scoreModel':scoreUrl, './sheetEditorRhythm':rhythmUrl, './sheetEditorPlayback':playbackUrl, '../../brodle/lib/musicGame':musicUrl,
  './sheetEditorCode': codeUrl,
  './sheetEditorCodeParser': parserUrl,
  './SheetCodeEditor': codeEditorUrl, './StudioPiano': studioPianoUrl, './StudioTutorial': stateUrl,
});
const { default: MelodyStudio } = await import(await sourceUrl('src/components/testing/sheet-editor/MelodyStudio.tsx', {
  '../../../auth/authContext': stateUrl, './SheetEditor': editorUrl, './sheetEditorCode': codeUrl, './studioDocument': studioUrl, './useMelodyStudio': stateUrl,
}));
const officialUrl = await sourceUrl('src/components/brodle/creator/MelodyStudioPage.tsx', {
  '../../testing/sheet-editor/MelodyStudio': await sourceUrl('src/components/testing/sheet-editor/MelodyStudio.tsx', {
    '../../../auth/authContext': stateUrl, './SheetEditor': editorUrl, './studioDocument': studioUrl, './useMelodyStudio': stateUrl,
  }), './melodyComposer': composerUrl,
});
const { default: OfficialMelodyStudio } = await import(officialUrl);
const accountUrl = await sourceUrl('src/auth/AccountControls.tsx', { './authContext': stateUrl });
const brodleHeaderUrl = await sourceUrl('src/components/brodle/components/BrodleSiteHeader.tsx', { '../../../auth/AccountControls': accountUrl, './BrodleIcon': stateUrl });
const headerUrl = await sourceUrl('src/components/layout/SiteHeader.tsx', { '../../auth/AccountControls': accountUrl, '../brodle/components/BrodleSiteHeader': brodleHeaderUrl });
const navigationUrl = await sourceUrl('src/components/brodle/components/BrodleNavigation.tsx', { '../../../auth/authContext': stateUrl, '../hooks/useBrodleAdmin': stateUrl });
const sidebarUrl = await sourceUrl('src/components/brodle/components/BrodleSideMenu.tsx', { './BrodleIcon': stateUrl, './BrodleNavigation': navigationUrl });
const { default: SiteLayout } = await import(await sourceUrl('src/components/layout/SiteLayout.tsx', {
  './SiteHeader': headerUrl, './SiteFooter': stateUrl, './navigation': await sourceUrl('src/components/layout/navigation.ts'),
  '../home/homeBackgrounds': moduleUrl("export const HOME_BACKGROUNDS = ['#000'];"), '../brodle/components/BrodleSideMenu': sidebarUrl,
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
test('the retired hands-on route opens the game tour', () => {
  const legacy = routes.find(route => route.path === '/brodle/tutorial');
  assert.equal(legacy.element.props.to, '/brodle?tour=1');
  assert.equal(legacy.element.props.replace, true);
});
let protectedRenders = 0;
function ProtectedHub() { protectedRenders++; return React.createElement(Testing); }
function ProtectedFallback() { protectedRenders++; return React.createElement(TestingNotFound); }
function ProtectedProbe() { protectedRenders++; return React.createElement('p', null, 'Protected experiment'); }
function ProtectedEditor() { protectedRenders++; return React.createElement(MelodyStudio); }
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
    assert.match(html, /Melody Studio/);
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
  assert.match(render(), /Melody Studio/);
  access(null, true);
  assert.match(render(), /Log in/);
  assert.equal(protectedRenders, 0);
});

test('the real sheet-editor child is authorized before the editor mounts', () => {
  assert.ok(testingRoute.children.some(route => route.path === 'sheet-editor'));
  access(confirmedAdmin, true);
  const html = render('/testing/sheet-editor');
  assert.match(html, /<h1>Melody Studio<\/h1>/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>Game melody/);
  assert.match(html, /role="tab"[^>]*>Victory melody/);
  assert.match(html, /role="tabpanel" aria-labelledby="studio-track-main"/);
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

test('official Create renders Studio for guests and ordinary authors inside the unchanged Brodle shell', () => {
  const officialRoute = routes.find(route => route.path === '/brodle/create');
  const classicRoute = routes.find(route => route.path === '/brodle/create/classic');
  assert.ok(officialRoute && classicRoute);
  assert.notEqual(officialRoute.element.type, classicRoute.element.type);
  function OfficialRoute() { return useRoutes([{ ...officialRoute, element: React.createElement(OfficialMelodyStudio) }]); }
  for (const user of [null, { id: 'ordinary' }]) {
    access(user);
    const html = renderToStaticMarkup(React.createElement(StaticRouter, { location: '/brodle/create' },
      React.createElement(SiteLayout, null, React.createElement(OfficialRoute))));
    assert.match(html, /official-melody-studio/);
    assert.match(html, /<h1>Melody Studio<\/h1>/);
    assert.match(html, /role="tablist"/);
    assert.match(html, /aria-label="Brodle navigation"/);
    assert.match(html, /brodle-site-header/);
    assert.doesNotMatch(html, /href="\/brodle\?tour=1"/);
    assert.doesNotMatch(html, /href="\/brodle\/tutorial"|hands-on example/);
    assert.equal((html.match(/aria-label="Account"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /Administrator access required/);
    if (user) { assert.match(html, />Log out<\/button>/); assert.match(html, /href="\/account"[^>]*>Profile/); }
    else assert.match(html, /href="\/login\?next=%2Fbrodle%2Fcreate"/);
  }
});

test('the official Studio offers existing previous-editor browser work without overwriting it', t => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify({ melody: [{ midi: 60, beats: 1, length: 'Quarter', rhythm: '♩' }], bpm: 120, key: 'C', timeSignature: '4/4' }) } });
  t.after(() => { if (prior) Object.defineProperty(globalThis, 'localStorage', prior); else delete globalThis.localStorage; });
  access(null);
  const renderOfficial = location => renderToStaticMarkup(React.createElement(StaticRouter, { location }, React.createElement(OfficialMelodyStudio)));
  assert.match(renderOfficial('/brodle/create'), /href="\/brodle\/create\/classic"/);
  assert.doesNotMatch(renderOfficial('/brodle/create?id=cloud'), /Open your draft from the previous editor/);
});

const { default: BrodleAdmin } = await import(await sourceUrl('src/components/brodle/admin/BrodleAdmin.tsx', {
  '../../../auth/authContext': stateUrl,
  '../hooks/useBrodleAdmin': stateUrl,
  '../hooks/usePianoAudio': stateUrl,
  '../services/melodyService': stateUrl,
  '../lib/melodyLibrary': libraryUrl,
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
