import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const patterns = [
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{16,}/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['npm token', /\bnpm_[A-Za-z0-9]{36,}/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['Stripe secret key', /\bsk_(?:live|test)_[A-Za-z0-9]{20,}/],
];

export function secretKinds(text) {
  const kinds = patterns.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
  for (const token of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(token[0].split('.')[1], 'base64url').toString());
      if (payload.role === 'service_role') kinds.push('Supabase service-role JWT');
    } catch { /* Ignore strings that are not JWTs. */ }
  }
  return [...new Set(kinds)];
}

export function sensitivePath(path) {
  const name = path.split('/').at(-1);
  return (name !== '.env.example' && /^\.env(?:\.|$)/.test(name))
    || ['.npmrc', '.netrc', 'id_rsa', 'id_ed25519'].includes(name)
    || /\.(?:pem|key|p12|pfx|dump|sqlite3?|db)$/i.test(name)
    || /(?:^|\/)(?:\.aws|\.codex|\.agents)\//.test(path);
}

export function checkPublication(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const findings = [];
  const inspect = (path, content, label = path) => {
    if (sensitivePath(path)) findings.push({ path: label, reason: 'private/local file would be published' });
    if (content.includes('\0')) return;
    for (const kind of secretKinds(content)) findings.push({ path: label, reason: kind });
  };
  const files = new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean));
  const collect = (directory) => {
    if (!existsSync(directory)) return;
    for (const name of readdirSync(directory)) {
      const path = resolve(directory, name), stat = lstatSync(path);
      if (stat.isSymbolicLink()) findings.push({ path: relative(root, path), reason: 'symlink in published assets' });
      else if (stat.isDirectory()) collect(path);
      else files.add(relative(root, path));
    }
  };
  collect(resolve(root, 'public'));
  collect(resolve(root, 'dist'));
  for (const path of files) {
    const full = resolve(root, path);
    if (!existsSync(full) || !lstatSync(full).isFile()) continue;
    // Compressed game builds and images are binary; scan all eligible text files.
    if (/\.(?:unityweb|png|webp|jpe?g|gif|ico|zip|wasm)$/i.test(path)) continue;
    inspect(path, readFileSync(full, 'utf8'));
  }
  const blobs = new Map();
  for (const entry of git('ls-files', '--stage', '-z').split('\0').filter(Boolean)) {
    const match = entry.match(/^(\d+) ([a-f0-9]+) \d\t([\s\S]+)$/);
    if (!match || !match[1].startsWith('100')) continue;
    const [, , oid, path] = match;
    if (/\.(?:unityweb|png|webp|jpe?g|gif|ico|zip|wasm)$/i.test(path)) continue;
    if (!blobs.has(oid)) blobs.set(oid, git('cat-file', 'blob', oid));
    inspect(path, blobs.get(oid), 'index:' + path);
  }
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const findings = checkPublication(root);
  if (findings.length) {
    for (const { path, reason } of findings) console.error(`${JSON.stringify(path)}: ${reason}`);
    process.exitCode = 1;
  } else console.log('Publication check passed: no matching secret patterns or private files in the working tree, Git index, public assets, or build.');
}
