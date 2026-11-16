#!/usr/bin/env node

/**
 * Prepare/bundle GUI helper tools for packaging.
 *
 * macOS: bundles `cliclick` into `resources/tools/darwin-{arch}/bin/cliclick`.
 * A matching Homebrew binary is copied when one is installed. The other Mac
 * architecture is cross-compiled from cliclick 5.1 so an Apple Silicon runner
 * can still produce the Intel DMG. The Homebrew cask requires macOS 13, so the
 * cross-compile sets MACOSX_DEPLOYMENT_TARGET=13.0.
 *
 * The Makefile assigns `CC = cc`, which ignores the environment. The compiler
 * is passed as a single make argument: `CC=clang -arch x86_64`.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CLICLICK_VERSION = '5.1';
const CLICLICK_URL = `https://github.com/BlueM/cliclick/archive/refs/tags/${CLICLICK_VERSION}.tar.gz`;
const DEPLOYMENT_TARGET = '13.0';

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function tryExecFile(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function detectBinaryArch(filePath) {
  const out = tryExecFile('/usr/bin/file', ['-b', filePath]);
  if (!out) return null;

  const hasArm64 = out.includes('arm64');
  const hasX64 = out.includes('x86_64');
  const isUniversal = out.includes('universal') || (hasArm64 && hasX64);

  if (isUniversal) return 'universal';
  if (hasArm64) return 'arm64';
  if (hasX64) return 'x64';
  return null;
}

function clangArch(electronArch) {
  if (electronArch === 'arm64') return 'arm64';
  if (electronArch === 'x64') return 'x86_64';
  throw new Error(`Unsupported cliclick arch: ${electronArch}`);
}

function requestedToolArches(argv = process.argv) {
  const index = argv.indexOf('--arch');
  if (index === -1) return ['arm64', 'x64'];
  const value = argv[index + 1] || '';
  const arches = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = new Set(['arm64', 'x64']);
  const unknown = arches.filter((arch) => !allowed.has(arch));
  if (arches.length === 0 || unknown.length > 0) {
    throw new Error(`Unsupported cliclick arch "${value}". Use arm64, x64, or arm64,x64.`);
  }
  return arches;
}

function copyExecutable(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  console.log(`✓ Bundled: ${src} -> ${dest}`);
}

function brewCandidates() {
  const candidates = new Set(['/opt/homebrew/bin/cliclick', '/usr/local/bin/cliclick']);
  const whichPath = tryExecFile('/usr/bin/which', ['cliclick']);
  if (whichPath) candidates.add(whichPath);
  return [...candidates].filter(exists);
}

function copyMatchingBrewBinary(arch, dest) {
  for (const src of brewCandidates()) {
    const found = detectBinaryArch(src);
    if (found === 'universal' || found === arch) {
      copyExecutable(src, dest);
      return true;
    }
  }
  return false;
}

function findMakefileDir(root) {
  const preferred = path.join(root, `cliclick-${CLICLICK_VERSION}`);
  if (exists(path.join(preferred, 'Makefile'))) return preferred;
  const entries = fs.readdirSync(root);
  for (const entry of entries) {
    const full = path.join(root, entry);
    if (exists(path.join(full, 'Makefile'))) return full;
  }
  return null;
}

function compileCliclick(arch, dest) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cliclick-'));
  try {
    const archive = path.join(tmp, 'cliclick.tar.gz');
    execFileSync('curl', ['-fsSL', '-o', archive, CLICLICK_URL], { stdio: 'inherit' });
    execFileSync('tar', ['-xzf', archive, '-C', tmp], { stdio: 'inherit' });
    const sourceDir = findMakefileDir(tmp);
    if (!sourceDir) {
      throw new Error('cliclick source did not contain a Makefile');
    }
    const generator = path.join(sourceDir, 'generate-action-classes-macro.sh');
    if (exists(generator)) fs.chmodSync(generator, 0o755);
    const cc = `clang -arch ${clangArch(arch)}`;
    execFileSync('make', [`CC=${cc}`], {
      cwd: sourceDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        MACOSX_DEPLOYMENT_TARGET: DEPLOYMENT_TARGET,
      },
    });
    const binary = path.join(sourceDir, 'cliclick');
    if (!exists(binary)) {
      throw new Error('cliclick build did not produce a binary');
    }
    copyExecutable(binary, dest);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function outputPath(projectRoot, arch) {
  return path.join(projectRoot, 'resources', 'tools', `darwin-${arch}`, 'bin', 'cliclick');
}

function binaryMatches(filePath, arch) {
  const found = detectBinaryArch(filePath);
  return found === 'universal' || found === arch;
}

function main() {
  if (process.platform !== 'darwin') {
    console.log('[prepare:gui-tools] Non-macOS platform, skipping.');
    return;
  }

  const projectRoot = path.join(__dirname, '..');
  const arches = requestedToolArches(process.argv);

  for (const arch of arches) {
    const dest = outputPath(projectRoot, arch);
    if (exists(dest) && binaryMatches(dest, arch)) {
      console.log(`[prepare:gui-tools] cliclick already present for ${arch}.`);
      continue;
    }

    if (copyMatchingBrewBinary(arch, dest) && binaryMatches(dest, arch)) {
      continue;
    }

    console.log(
      `[prepare:gui-tools] No ${arch} Homebrew cliclick. Cross-compiling ${CLICLICK_VERSION} for ${clangArch(arch)}.`
    );
    compileCliclick(arch, dest);
    if (!binaryMatches(dest, arch)) {
      throw new Error(
        `cliclick for ${arch} is ${detectBinaryArch(dest) || 'unreadable'} after build: ${dest}`
      );
    }
  }
}

module.exports = {
  CLICLICK_VERSION,
  clangArch,
  requestedToolArches,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[prepare:gui-tools] ${error && error.message ? error.message : error}`);
    process.exit(1);
  }
}
