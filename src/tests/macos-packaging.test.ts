import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const packaging = require('../../scripts/macos-packaging.js');
const { packagingArches } = require('../../scripts/pre-build-check.js');
const guiTools = require('../../scripts/prepare-gui-tools.js');

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macos-packaging-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeFile(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'placeholder');
}

function fakeMacApp(root: string): string {
  const resources = path.join(root, 'Open Cowork.app', 'Contents', 'Resources');
  writeFile(path.join(root, 'Open Cowork.app', 'Contents', 'MacOS', 'Open Cowork'));
  writeFile(path.join(resources, 'node', 'bin', 'node'));
  writeFile(path.join(resources, 'python', 'bin', 'python3'));
  writeFile(path.join(resources, 'tools', 'bin', 'cliclick'));
  writeFile(path.join(resources, 'mcp', 'gui-operate-server.js'));
  writeFile(path.join(resources, 'mcp', 'software-dev-server-example.js'));
  writeFile(path.join(resources, 'lima-agent', 'index.js'));
  writeFile(
    path.join(
      resources,
      'app.asar.unpacked',
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node'
    )
  );
  fs.mkdirSync(path.join(resources, 'skills'), { recursive: true });
  return root;
}

describe('macOS Intel packaging helpers', () => {
  it('downloads both Mac Node arches unless the env list says otherwise', () => {
    expect(packaging.archesToDownload('darwin', ['arm64', 'x64'], {})).toEqual(['arm64', 'x64']);
    expect(
      packaging.archesToDownload('darwin', ['arm64', 'x64'], {
        OPEN_COWORK_NODE_ARCHES: 'x64',
      })
    ).toEqual(['x64']);
    expect(() =>
      packaging.archesToDownload('darwin', ['arm64', 'x64'], {
        OPEN_COWORK_NODE_ARCHES: 'ppc',
      })
    ).toThrow(/Unsupported Node.js arch/);
    expect(packaging.archesToDownload('win32', ['x64'], {}, 'x64')).toEqual(['x64']);
    expect(packaging.archesToDownload('linux', ['x64'], {}, 'arm64')).toEqual(['x64']);
  });

  it('prepares the host Python arch before the cross arch', () => {
    expect(packaging.orderPythonArches(['arm64', 'x64'], 'x64')).toEqual(['x64', 'arm64']);
    expect(packaging.orderPythonArches(['arm64', 'x64'], 'arm64')).toEqual(['arm64', 'x64']);
    expect(
      packaging.pipPythonCandidates({
        envPython: '/opt/pip-python',
        targetPython: '/bundle/x64/bin/python3',
        siblingPythons: ['/bundle/arm64/bin/python3', '/bundle/x64/bin/python3'],
        systemPython: '/usr/bin/python3',
      })
    ).toEqual([
      '/opt/pip-python',
      '/bundle/x64/bin/python3',
      '/bundle/arm64/bin/python3',
      '/usr/bin/python3',
    ]);
  });

  it('selects the sharp prebuilds for the target arch', () => {
    const names = packaging
      .sharpPackagesForArch(
        {
          optionalDependencies: {
            '@img/sharp-darwin-arm64': '0.34.2',
            '@img/sharp-libvips-darwin-arm64': '1.1.0',
            '@img/sharp-darwin-x64': '0.34.2',
            '@img/sharp-libvips-darwin-x64': '1.1.0',
            '@img/sharp-linux-x64': '0.34.2',
          },
        },
        'darwin',
        'x64'
      )
      .map((pkg: { name: string }) => pkg.name);
    expect(names).toEqual(['@img/sharp-darwin-x64', '@img/sharp-libvips-darwin-x64']);
  });

  it('drops @img packages that do not match the packed arch', () => {
    const root = tempDir();
    const img = path.join(root, 'node_modules', '@img');
    for (const name of [
      'sharp-darwin-arm64',
      'sharp-wasm32',
      'sharp-darwin-x64',
      'sharp-libvips-darwin-x64',
    ]) {
      fs.mkdirSync(path.join(img, name), { recursive: true });
    }
    const removed = packaging.pruneImgTree(root, 'darwin', 'arm64');
    expect(fs.existsSync(path.join(img, 'sharp-darwin-arm64'))).toBe(true);
    expect(fs.existsSync(path.join(img, 'sharp-wasm32'))).toBe(true);
    expect(fs.existsSync(path.join(img, 'sharp-darwin-x64'))).toBe(false);
    expect(removed).toEqual(
      expect.arrayContaining(['sharp-darwin-x64', 'sharp-libvips-darwin-x64'])
    );
  });

  it('accepts an x64 app whose Mach-O files are x86_64', () => {
    const root = fakeMacApp(tempDir());
    const result = packaging.verifyMacApp(root, 'x64', {
      readArchs: () => ['x86_64'],
    });
    expect(result.errors).toEqual([]);
    expect(result.notes.join('\n')).toContain('photon-node');
  });

  it('rejects an x64 app that still contains an arm64 cliclick', () => {
    const root = fakeMacApp(tempDir());
    const result = packaging.verifyMacApp(root, 'x64', {
      readArchs: (file: string) => (file.endsWith(`${path.sep}cliclick`) ? ['arm64'] : ['x86_64']),
    });
    expect(result.errors.join('\n')).toContain('cliclick');
  });

  it('requires the better-sqlite3 addon', () => {
    const root = fakeMacApp(tempDir());
    const addon = path.join(
      root,
      'Open Cowork.app',
      'Contents',
      'Resources',
      'app.asar.unpacked',
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node'
    );
    fs.rmSync(addon);
    const result = packaging.verifyMacApp(root, 'arm64', { readArchs: () => ['arm64'] });
    expect(result.errors.join('\n')).toContain('better-sqlite3');
  });

  it('packages both Mac architectures and keeps the Intel DMG out of the Homebrew cask', () => {
    expect(packagingArches('darwin')).toEqual(['arm64', 'x64']);
    expect(packagingArches('win32', 'x64')).toEqual(['x64']);
    expect(guiTools.clangArch('x64')).toBe('x86_64');
    expect(guiTools.clangArch('arm64')).toBe('arm64');
    expect(guiTools.requestedToolArches(['node', 'prepare-gui-tools.js'])).toEqual([
      'arm64',
      'x64',
    ]);
    expect(guiTools.requestedToolArches(['node', 'prepare-gui-tools.js', '--arch', 'x64'])).toEqual(
      ['x64']
    );

    const builder = fs.readFileSync(path.resolve('electron-builder.yml'), 'utf8');
    const mac = builder.split('\nmac:')[1].split('\nlinux:')[0];
    expect(mac).toContain('arm64');
    expect(mac).toContain('x64');
    expect(builder).toContain('beforePack: ./scripts/before-pack.js');

    const release = fs.readFileSync(path.resolve('.github/workflows/release.yml'), 'utf8');
    const appleSilicon = release.split('build-macos:')[1].split('build-macos-intel:')[0];
    const intel = release.split('build-macos-intel:')[1].split('build-windows:')[0];
    expect(appleSilicon).toContain('runs-on: macos-15\n');
    expect(appleSilicon).toContain('package-macos.sh arm64');
    expect(appleSilicon).toContain('package-macos.sh x64');
    expect(appleSilicon).toContain('*-mac-arm64.dmg');
    expect(appleSilicon).toContain('*-mac-x64.dmg');
    expect(intel).toContain('runs-on: macos-15-intel');
    expect(intel).toContain('package-macos.sh x64');
    expect(intel).not.toContain('action-gh-release');

    const homebrew = fs.readFileSync(path.resolve('.github/workflows/update-homebrew.yml'), 'utf8');
    expect(homebrew).toContain('runs-on: macos-15');
    expect(homebrew).toContain('Open.Cowork-${VERSION}-mac-arm64.dmg');
    expect(homebrew).not.toContain('runs-on: macos-14');
  });
});
