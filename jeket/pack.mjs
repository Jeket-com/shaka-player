#!/usr/bin/env node
/**
 * Packs the experimental build as @jeket-cloud/shaka-player (Jeket-com/JSS#1560).
 *
 * Run after the experimental bundles are built (see .github/workflows/jeket.yaml):
 *
 *   node jeket/pack.mjs
 *
 * It stages dist/shaka-player.experimental{,.debug}.{js,d.ts} under vendor/,
 * writes PIN.json (commit, toolchain, commands, sha256 of every file) and runs
 * `npm pack`, leaving jeket/out/jeket-cloud-shaka-player-<version>.tgz.
 *
 * The version is the tag's (v5.3.6-jeket.1 -> 5.3.6-jeket.1) on a tag build,
 * which must name this tree's upstream version; otherwise
 * <upstream>-jeket.dev.<commit>, which is never released.
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'jeket', 'out');
const stage = join(out, 'package');

/** The bundles consumers import: `@jeket-cloud/shaka-player` and `@jeket-cloud/shaka-player/debug`. */
const FILES = [
  'shaka-player.experimental.js',
  'shaka-player.experimental.d.ts',
  'shaka-player.experimental.debug.js',
  'shaka-player.experimental.debug.d.ts',
];

const COMMANDS = [
  'npm ci',
  'python3 build/gendeps.py',
  'python3 build/build.py --name experimental +@complete --force',
  'python3 build/build.py --name experimental --debug +@complete --force',
  'node jeket/pack.mjs',
];

function fail(message) {
  console.error(`pack: ${message}`);
  process.exit(1);
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

/** A tool's version line, from stdout or stderr (java prints to stderr). */
function toolVersion(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return `${r.stdout}${r.stderr}`.trim().split('\n')[0];
}

const upstream = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : null;
let version;
if (tag) {
  const m = /^v(\d+\.\d+\.\d+-jeket\.\d+)$/.exec(tag);
  if (!m) fail(`tag ${tag} is not v<upstream>-jeket.<n>`);
  if (!m[1].startsWith(`${upstream}-`)) fail(`tag ${tag} does not name this tree's upstream version ${upstream}`);
  version = m[1];
} else {
  version = `${upstream}-jeket.dev.${git('rev-parse', '--short=9', 'HEAD')}`;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(stage, 'vendor'), { recursive: true });

const sha256 = {};
for (const file of FILES) {
  const src = join(root, 'dist', file);
  if (!existsSync(src)) fail(`dist/${file} is missing: build the experimental bundles first`);
  copyFileSync(src, join(stage, 'vendor', file));
  sha256[file] = createHash('sha256').update(readFileSync(src)).digest('hex');
}
copyFileSync(join(root, 'LICENSE'), join(stage, 'LICENSE'));

const pin = {
  repo: 'https://github.com/Jeket-com/shaka-player',
  ref: tag ?? process.env.GITHUB_HEAD_REF ?? process.env.GITHUB_REF_NAME ?? git('rev-parse', '--abbrev-ref', 'HEAD'),
  commit: git('rev-parse', 'HEAD'),
  upstream: `v${upstream}`,
  version,
  toolchain: {
    java: toolVersion('java', ['-version']),
    python: toolVersion('python3', ['--version']),
    node: process.version,
  },
  commands: COMMANDS,
  sha256,
};
writeFileSync(join(stage, 'PIN.json'), `${JSON.stringify(pin, null, 2)}\n`);

const pkg = {
  name: '@jeket-cloud/shaka-player',
  version,
  description: `Shaka Player ${upstream} with Jeket's fixes: the experimental bundle (MoQ/MSF, HLS, DASH).`,
  license: 'Apache-2.0',
  repository: { type: 'git', url: 'https://github.com/Jeket-com/shaka-player' },
  main: './vendor/shaka-player.experimental.js',
  types: './vendor/shaka-player.experimental.d.ts',
  exports: {
    '.': {
      types: './vendor/shaka-player.experimental.d.ts',
      default: './vendor/shaka-player.experimental.js',
    },
    './debug': {
      types: './vendor/shaka-player.experimental.debug.d.ts',
      default: './vendor/shaka-player.experimental.debug.js',
    },
    './PIN.json': './PIN.json',
  },
  files: ['vendor', 'PIN.json', 'LICENSE', 'README.md'],
};
writeFileSync(join(stage, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

writeFileSync(
  join(stage, 'README.md'),
  [
    '# @jeket-cloud/shaka-player',
    '',
    `Shaka Player ${upstream} with Jeket's fixes, built from ${pin.repo} at ${pin.commit}.`,
    'The experimental bundle: MoQ (MSF over WebTransport), HLS and DASH.',
    '',
    '```js',
    "import shaka from '@jeket-cloud/shaka-player';        // release",
    "import shaka from '@jeket-cloud/shaka-player/debug';  // with shaka.log",
    '```',
    '',
    'PIN.json records the commit, toolchain, build commands and the sha256 of every bundle.',
    '',
  ].join('\n'),
);

execFileSync('npm', ['pack', '--pack-destination', out], { cwd: stage, stdio: 'inherit' });
console.log(`pack: ${join(out, `jeket-cloud-shaka-player-${version}.tgz`)}`);
