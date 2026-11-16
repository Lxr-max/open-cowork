/**
 * Helpers for macOS arm64 and x64 packaging.
 *
 * electron-builder rebuilds native addons for the arch it is packing, but a
 * one-line `arch: x64` change is not enough on its own:
 * - better-sqlite3 is compiled for the host unless the Electron rebuild sets
 *   the target arch
 * - sharp (when installed) loads @img prebuilds selected at install time, so
 *   an Apple Silicon `npm ci` does not contain the Intel binary
 * - bundled Node, Python, and cliclick are copied from darwin-${arch}
 *
 * Image resizing in the current app uses @silvia-odwyer/photon-node (wasm),
 * which is the same file on both Mac architectures. sharp/@img are still
 * unpacked when present, and the Intel prebuild is installed before packaging.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const NATIVE_REBUILD_MODULES = ['better-sqlite3', 'bufferutil', 'utf-8-validate'];

const IMG_ARCH_TOKENS = [
  ['linuxmusl-arm64', 'linux', 'arm64'],
  ['linuxmusl-x64', 'linux', 'x64'],
  ['linux-arm64', 'linux', 'arm64'],
  ['linux-x64', 'linux', 'x64'],
  ['darwin-arm64', 'darwin', 'arm64'],
  ['darwin-x64', 'darwin', 'x64'],
  ['win32-arm64', 'win32', 'arm64'],
  ['win32-x64', 'win32', 'x64'],
  ['win32-ia32', 'win32', 'ia32'],
];

function machoArch(electronArch) {
  if (electronArch === 'arm64') return 'arm64';
  if (electronArch === 'x64') return 'x86_64';
  if (electronArch === 'ia32') return 'i386';
  throw new Error(`Unsupported macOS arch: ${electronArch}`);
}

/**
 * Node tarballs to fetch for one OS.
 * On macOS both arm64 and x64 are required for the two installers.
 * OPEN_COWORK_NODE_ARCHES=arm64,x64 overrides that (used so the Apple
 * Silicon release phase does not download the Intel tarball early).
 */
function archesToDownload(platform, configuredArchs, env = process.env, hostArch = process.arch) {
  const configured = Array.isArray(configuredArchs) ? configuredArchs.slice() : [];
  const explicit = String((env && env.OPEN_COWORK_NODE_ARCHES) || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (explicit.length > 0) {
    const unknown = explicit.filter((arch) => !configured.includes(arch));
    if (unknown.length > 0) {
      throw new Error(
        `Unsupported Node.js arch for ${platform}: ${unknown.join(', ')}. Configured: ${configured.join(', ')}`
      );
    }
    return explicit;
  }
  if ((env && env.OPEN_COWORK_DOWNLOAD_ALL_NODE_BINARIES === '1') || platform === 'darwin') {
    return configured;
  }
  if (configured.includes(hostArch)) return [hostArch];
  return configured.slice(0, 1);
}

function orderPythonArches(arches, hostArch) {
  const ordered = arches.slice();
  const index = ordered.indexOf(hostArch);
  if (index > 0) {
    ordered.splice(index, 1);
    ordered.unshift(hostArch);
  }
  return ordered;
}

function pipPythonCandidates({ envPython, targetPython, siblingPythons, systemPython } = {}) {
  const ordered = [envPython, targetPython, ...(siblingPythons || []), systemPython];
  const seen = new Set();
  const result = [];
  for (const item of ordered) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function installedNativeModules(rootDir, moduleNames = NATIVE_REBUILD_MODULES) {
  return moduleNames.filter((name) =>
    fs.existsSync(path.join(rootDir, 'node_modules', name, 'package.json'))
  );
}

/**
 * @param {string} platform node platform: darwin, linux, win32
 * @param {string} arch electron arch: arm64 or x64
 * @returns {Array<{ name: string, spec: string }>}
 */
function sharpPackagesForArch(sharpPackageJson, platform, arch) {
  const optional = (sharpPackageJson && sharpPackageJson.optionalDependencies) || {};
  const needle = `${platform}-${arch}`;
  return Object.entries(optional)
    .filter(([name]) => name.includes(needle))
    .map(([name, version]) => ({ name, spec: `${name}@${version}` }));
}

function parseImgPackageName(dirName) {
  const match = /^sharp(?:-libvips)?-(.+)$/.exec(dirName);
  if (!match) return null;
  const token = match[1];
  if (token === 'wasm32') {
    return { platform: 'wasm', cpu: 'wasm32' };
  }
  for (const [suffix, platform, cpu] of IMG_ARCH_TOKENS) {
    if (token === suffix) return { platform, cpu };
  }
  return { platform: 'unknown', cpu: token };
}

function imgPackageMatchesTarget(dirName, platform, arch) {
  const parsed = parseImgPackageName(dirName);
  if (!parsed) return true;
  if (parsed.cpu === 'wasm32' || parsed.platform === 'unknown') return true;
  return parsed.platform === platform && parsed.cpu === arch;
}

function pruneImgTree(root, platform, arch) {
  const removed = [];
  function walk(current, depth) {
    if (depth > 8 || !fs.existsSync(current)) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(current, entry.name);
      if (entry.name === '@img') {
        let packages = [];
        try {
          packages = fs.readdirSync(full);
        } catch {
          packages = [];
        }
        for (const pkg of packages) {
          if (imgPackageMatchesTarget(pkg, platform, arch)) continue;
          fs.rmSync(path.join(full, pkg), { recursive: true, force: true });
          removed.push(pkg);
        }
      } else if (!entry.name.startsWith('.')) {
        walk(full, depth + 1);
      }
    }
  }
  walk(root, 0);
  return removed;
}

function readMachOArchs(filePath) {
  try {
    const output = execFileSync('/usr/bin/lipo', ['-archs', filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.trim().split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

function resolveAppPath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`macOS app target does not exist: ${targetPath}`);
  }
  if (targetPath.endsWith('.app')) return targetPath;
  const apps = fs
    .readdirSync(targetPath)
    .filter(
      (name) => name.endsWith('.app') && fs.statSync(path.join(targetPath, name)).isDirectory()
    );
  if (apps.length !== 1) {
    throw new Error(
      `Expected one .app under ${targetPath}, found ${apps.length}: ${apps.join(', ')}`
    );
  }
  return path.join(targetPath, apps[0]);
}

function checkBinary(filePath, expected, label, errors, readArchs, requiredMachO) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${label} is missing: ${filePath}`);
    return;
  }
  let resolved = filePath;
  try {
    resolved = fs.realpathSync(filePath);
  } catch {
    errors.push(`${label} could not be resolved: ${filePath}`);
    return;
  }
  const archs = readArchs(resolved);
  if (!archs.length) {
    if (requiredMachO) errors.push(`${label} is not a Mach-O binary: ${resolved}`);
    return;
  }
  if (!archs.includes(expected)) {
    errors.push(`${label} is ${archs.join(', ')}, expected ${expected}: ${resolved}`);
  }
}

function collectFiles(dir, predicate, results = []) {
  if (!fs.existsSync(dir)) return results;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, predicate, results);
    } else if ((entry.isFile() || entry.isSymbolicLink()) && predicate(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Check a packaged .app (or a directory that contains exactly one .app).
 * `readArchs` is injectable so tests can run without Mach-O fixtures.
 */
function verifyMacApp(targetPath, electronArch, options = {}) {
  const expected = machoArch(electronArch);
  const readArchs = options.readArchs || readMachOArchs;
  const appPath = resolveAppPath(targetPath);
  const appName = path.basename(appPath, '.app');
  const resources = path.join(appPath, 'Contents', 'Resources');
  const errors = [];
  const notes = [];

  checkBinary(
    path.join(appPath, 'Contents', 'MacOS', appName),
    expected,
    'main executable',
    errors,
    readArchs,
    true
  );
  checkBinary(
    path.join(resources, 'node', 'bin', 'node'),
    expected,
    'bundled Node',
    errors,
    readArchs,
    true
  );
  checkBinary(
    path.join(resources, 'python', 'bin', 'python3'),
    expected,
    'bundled Python',
    errors,
    readArchs,
    true
  );
  checkBinary(
    path.join(resources, 'tools', 'bin', 'cliclick'),
    expected,
    'cliclick',
    errors,
    readArchs,
    true
  );

  const requiredResources = [
    ['file', path.join(resources, 'mcp', 'gui-operate-server.js'), 'GUI Operate MCP server'],
    [
      'file',
      path.join(resources, 'mcp', 'software-dev-server-example.js'),
      'Software Dev MCP server',
    ],
    ['file', path.join(resources, 'lima-agent', 'index.js'), 'Lima agent'],
    ['dir', path.join(resources, 'skills'), 'skills'],
  ];
  for (const [kind, filePath, label] of requiredResources) {
    let ok = false;
    try {
      const stat = fs.statSync(filePath);
      ok = kind === 'dir' ? stat.isDirectory() : stat.isFile();
    } catch {
      ok = false;
    }
    if (!ok) errors.push(`${label} is missing: ${filePath}`);
  }

  const nodeAddons = collectFiles(path.join(resources, 'app.asar.unpacked'), (name) =>
    name.endsWith('.node')
  );
  const sqliteAddons = nodeAddons.filter((file) => /better[-_]sqlite3/i.test(file));
  if (sqliteAddons.length === 0) {
    errors.push('packaged app is missing the better-sqlite3 native addon');
  }
  for (const file of nodeAddons) {
    checkBinary(file, expected, `native addon ${path.basename(file)}`, errors, readArchs, true);
  }

  const pythonNative = [
    ...collectFiles(path.join(resources, 'python'), (name) => name.endsWith('.so')),
    ...collectFiles(path.join(resources, 'python'), (name) => name.endsWith('.dylib')),
  ];
  for (const file of pythonNative) {
    checkBinary(
      file,
      expected,
      `Python native library ${path.basename(file)}`,
      errors,
      readArchs,
      false
    );
  }

  const sharpAddons = nodeAddons.filter((file) => /sharp|libvips/i.test(file));
  if (sharpAddons.length === 0) {
    notes.push(
      'sharp native binary not packaged; image resizing uses photon-node wasm, which is architecture-independent'
    );
  } else {
    notes.push(`sharp native binaries checked: ${sharpAddons.length}`);
  }
  notes.push(`native addons checked: ${nodeAddons.length}`);
  return { appPath, errors, notes, expected };
}

module.exports = {
  NATIVE_REBUILD_MODULES,
  archesToDownload,
  checkBinary,
  collectFiles,
  imgPackageMatchesTarget,
  installedNativeModules,
  machoArch,
  orderPythonArches,
  parseImgPackageName,
  pipPythonCandidates,
  pruneImgTree,
  readMachOArchs,
  resolveAppPath,
  sharpPackagesForArch,
  verifyMacApp,
};
