#!/usr/bin/env node

/**
 * Rebuild packaged native modules for one Electron arch.
 *
 * Default arch is the host arch, which is what `postinstall` needs.
 * Release packaging calls this once per Mac arch before electron-builder so
 * better-sqlite3 (and sharp's @img prebuild, when sharp is installed) match
 * the DMG being produced. electron-builder rebuilds again while packing; the
 * afterPack hook rejects an app whose Mach-O files do not match that arch.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { installedNativeModules, sharpPackagesForArch } = require('./macos-packaging');

const ROOT = path.join(__dirname, '..');
const ALLOWED_ARCH = new Set(['arm64', 'x64', 'ia32']);

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function electronVersion() {
  const pkg = require(path.join(ROOT, 'node_modules', 'electron', 'package.json'));
  const match = String(pkg.version || '').match(/\d+\.\d+\.\d+/);
  if (!match) {
    throw new Error(`Could not read an Electron version from ${pkg.version}`);
  }
  return match[0];
}

function ensureSharpPrebuilds(platform, arch) {
  const sharpPackagePath = path.join(ROOT, 'node_modules', 'sharp', 'package.json');
  if (!fs.existsSync(sharpPackagePath)) {
    console.log(
      '[rebuild-native] sharp is not installed. Image resizing uses @silvia-odwyer/photon-node (wasm, both Mac architectures). @img prebuilds are installed only when sharp is present.'
    );
    return;
  }

  const sharpPackage = JSON.parse(fs.readFileSync(sharpPackagePath, 'utf8'));
  const packages = sharpPackagesForArch(sharpPackage, platform, arch);
  if (packages.length === 0) {
    console.warn(
      `[rebuild-native] sharp is installed but has no optional @img package for ${platform}-${arch}`
    );
    return;
  }

  const missing = packages.filter(
    (pkg) => !fs.existsSync(path.join(ROOT, 'node_modules', ...pkg.name.split('/')))
  );
  if (missing.length === 0) {
    console.log(
      `[rebuild-native] sharp @img prebuilds already present for ${platform}-${arch}: ${packages
        .map((pkg) => pkg.name)
        .join(', ')}`
    );
    return;
  }

  console.log(
    `[rebuild-native] Installing sharp prebuilds for ${platform}-${arch}: ${missing
      .map((pkg) => pkg.spec)
      .join(' ')}`
  );
  execSync(
    `npm install --no-save --ignore-scripts --no-package-lock --no-audit --no-fund ${missing
      .map((pkg) => JSON.stringify(pkg.spec))
      .join(' ')}`,
    { cwd: ROOT, stdio: 'inherit' }
  );
}

function rebuild(arch) {
  if (!ALLOWED_ARCH.has(arch)) {
    throw new Error(`Unsupported rebuild arch: ${arch}`);
  }
  const modules = installedNativeModules(ROOT);
  if (!modules.includes('better-sqlite3')) {
    throw new Error('better-sqlite3 is not installed. Run npm ci before packaging.');
  }

  const version = electronVersion();
  const platform = process.platform;
  console.log(
    `[rebuild-native] Rebuilding ${modules.join(', ')} for Electron ${version} ${platform}-${arch}`
  );
  ensureSharpPrebuilds(platform, arch);

  const env = {
    ...process.env,
    npm_config_arch: arch,
    npm_config_target_arch: arch,
    npm_config_target_platform: platform,
    npm_config_runtime: 'electron',
    npm_config_target: version,
    npm_config_disturl: 'https://electronjs.org/headers',
    npm_config_fallback_to_build: 'true',
  };
  execSync(
    `npm rebuild ${modules.join(' ')} --runtime=electron --target=${version} --disturl=https://electronjs.org/headers --arch=${arch}`,
    { cwd: ROOT, stdio: 'inherit', env }
  );
}

function main() {
  const arch = readArg('--arch') || process.arch;
  rebuild(arch);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[rebuild-native] ${error && error.message ? error.message : error}`);
    process.exit(1);
  }
}

module.exports = { rebuild, ensureSharpPrebuilds };
