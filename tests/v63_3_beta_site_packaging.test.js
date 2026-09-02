const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const tmpBase = fs.mkdtempSync(path.join(root, '.tmp-beta-site-'));
const relOut = path.relative(root, path.join(tmpBase, 'beta'));

try {
  const run = spawnSync('bash', [
    'scripts/stage-deployment-site.sh',
    'eve-research/eve',
    'beta',
    'main',
    'beta',
    relOut,
    '.',
    'test'
  ], { cwd: root, encoding: 'utf8' });

  assert.strictEqual(run.status, 0, `beta site staging failed:\n${run.stdout}\n${run.stderr}`);
  const zip = path.join(root, relOut, 'downloads', 'Eve-beta-local-relay-kit.zip');
  assert(fs.existsSync(zip), 'beta Local + Relay ZIP should be created at the requested relative output path');
  assert(fs.statSync(zip).size > 0, 'beta Local + Relay ZIP should not be empty');
  console.log('v63.3 Beta site packaging regression passed');
} finally {
  fs.rmSync(tmpBase, { recursive: true, force: true });
}
