// Offline secret scan of git-tracked files for Meta credential shapes.
// Complements gitleaks in CI. Synthetic fixtures are short and marked DONOTUSE.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const rules = [
  ['Meta access token', /\bEA[A-Za-z0-9]{60,}\b/],
  ['Meta app access token', /\b\d{14,17}\|[A-Za-z0-9_-]{25,}\b/],
  ['App secret assignment', /META_APP_SECRET\s*[=:]\s*["']?[a-f0-9]{32}\b/i],
  ['Access token assignment', /META_ACCESS_TOKEN\s*[=:]\s*["']?EA[A-Za-z0-9]{20,}/],
  ['Private key', /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/],
];
const findings = [];
for (const file of files) {
  if (file === 'pnpm-lock.yaml' || /\.(png|jpg|gif|ico)$/.test(file)) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of rules) {
      if (re.test(line) && !line.includes('DONOTUSE')) findings.push(`${file}:${i + 1} ${name}`);
    }
  });
}
if (findings.length) {
  console.error('Potential secrets found:\n' + findings.join('\n'));
  process.exit(1);
}
console.log(`check-secrets: ${files.length} tracked files clean`);
