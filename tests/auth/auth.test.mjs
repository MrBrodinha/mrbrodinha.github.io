import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../../src/auth/authUtils.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { validUsername, safeReturnPath, authErrorMessage, signupErrorMessage, returnLinkError } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('usernames accept only 3–30 ASCII letters, numbers and underscores', () => {
  for (const value of ['abc', 'A_b123', 'X'.repeat(30), '123']) assert.equal(validUsername(value), true);
  for (const value of ['', 'ab', 'a'.repeat(31), 'alice-b', 'a b', 'élise', 'abc\n', 'a@b', null, 123]) assert.equal(validUsername(value), false);
});
test('login return paths cannot redirect to another origin or an auth loop', () => {
  for (const path of ['/brodle', '/brodle/create', '/brodle/melodies', '/brodle/admin', '/redbull']) assert.equal(safeReturnPath(path), path);
  for (const path of ['https://evil.test', '//evil.test', '/\\evil.test', '/login', '/auth/reset-password', null]) assert.equal(safeReturnPath(path), '/account');
});
test('raw Auth errors never expose credentials or internal details', () => {
  const sensitive = 'someone@example.test password=do-not-display';
  assert.doesNotMatch(authErrorMessage({ message: sensitive }), /someone|do-not-display/);
  assert.match(authErrorMessage({ code: 'email_not_confirmed' }), /Confirm your email/);
  assert.match(authErrorMessage({ status: 429 }), /Too many requests/);
  assert.match(authErrorMessage({ code: 'invalid_credentials' }), /incorrect/);
});
test('confirmation and recovery errors handle both query and fragment returns', () => {
  assert.equal(returnLinkError('', '#access_token=opaque&type=recovery'), null);
  assert.match(returnLinkError('?error=access_denied&error_code=otp_expired', ''), /expired/);
  assert.match(returnLinkError('', '#error=access_denied&error_code=otp_expired'), /expired/);
  assert.doesNotMatch(returnLinkError('?error=private@example.test&error_description=secret', ''), /private|secret/);
});

test('signup constraint errors are helpful without exposing private database messages', () => {
  const message = signupErrorMessage({ status: 500, message: 'Database error saving new user: private@example.test' });
  assert.match(message, /username may already be taken/);
  assert.doesNotMatch(message, /private@example|Database error/);
  assert.match(signupErrorMessage({ code: 'weak_password' }), /stronger password/);
});

const resetSource = await readFile(new URL('../../src/auth/loginReset.ts', import.meta.url), 'utf8');
const resetJs = ts.transpileModule(resetSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { isNewSignIn, clearSavedBrodleProgress } = await import(`data:text/javascript;base64,${Buffer.from(resetJs).toString('base64')}`);

test('fresh sign-ins reset rounds, while restoration, focus and token refresh preserve them', () => {
  assert.equal(isNewSignIn('SIGNED_IN', null, 'alice'), true);
  assert.equal(isNewSignIn('SIGNED_IN', 'alice', 'bob'), true);
  assert.equal(isNewSignIn('PASSWORD_RECOVERY', null, 'alice'), true);
  assert.equal(isNewSignIn('SIGNED_IN', undefined, 'alice'), false);
  assert.equal(isNewSignIn('INITIAL_SESSION', undefined, 'alice'), false);
  assert.equal(isNewSignIn('SIGNED_IN', 'alice', 'alice'), false);
  assert.equal(isNewSignIn('TOKEN_REFRESHED', 'alice', 'alice'), false);
  assert.equal(isNewSignIn('SIGNED_OUT', 'alice', null), false);
});
test('login clears every stored game round without deleting the SDK session or authored data', () => {
  const values = new Map([
    ['brodle:progress:v1:today', 'round'], ['brodle:progress:v1:yesterday', 'round'],
    ['sb-project-auth-token', 'sdk-session'], ['brodle:composer:v1', 'melody'],
    ['redbull:draft:v1:alice', 'rating'], ['unrelated', 'value'],
  ]);
  clearSavedBrodleProgress({ get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => values.delete(key) });
  assert.deepEqual([...values.keys()], ['sb-project-auth-token', 'brodle:composer:v1', 'redbull:draft:v1:alice', 'unrelated']);
});
