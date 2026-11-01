import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkPublication, secretKinds, sensitivePath } from '../../tools/security/check-publication.mjs';

test('publication checks distinguish public keys from privileged keys without echoing values', () => {
  assert.deepEqual(secretKinds('sb_publishable_' + 'x'.repeat(32)), []);
  assert.deepEqual(secretKinds('sb_secret_' + 'x'.repeat(32)), ['Supabase secret key']);
  const jwt = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from('{"role":"service_role"}').toString('base64url'), 'test-signature'].join('.');
  assert.deepEqual(secretKinds(jwt), ['Supabase service-role JWT']);
  assert.equal(sensitivePath('.env.example'), false);
  for (const path of ['.env', 'public/.env.production', 'cert/private.pem', '.aws/credentials']) assert.equal(sensitivePath(path), true);
});

test('ignored public/build files and staged secrets cannot bypass the publication check', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publication-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  const secret = 'sb_secret_' + 'x'.repeat(32);
  try {
    git('init', '--quiet');
    await writeFile(join(root, '.gitignore'), '.env*\ndist/\n');
    await writeFile(join(root, 'staged.txt'), secret);
    git('add', 'staged.txt');
    await writeFile(join(root, '.env'), 'private data');
    git('add', '--force', '.env');
    await writeFile(join(root, 'staged.txt'), 'clean working copy');
    await mkdir(join(root, 'public'));
    await writeFile(join(root, 'public', '.env.local'), 'private data');
    await mkdir(join(root, 'dist'));
    await writeFile(join(root, 'dist', 'leak.js'), secret);
    const findings = checkPublication(root);
    assert.ok(findings.some(finding => finding.path === 'index:staged.txt'));
    assert.ok(findings.some(finding => finding.path === 'index:.env'));
    assert.ok(findings.some(finding => finding.path === 'public/.env.local'));
    assert.ok(findings.some(finding => finding.path === 'dist/leak.js'));
    assert.equal(JSON.stringify(findings).includes(secret), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
