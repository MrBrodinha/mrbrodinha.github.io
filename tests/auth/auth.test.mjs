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
