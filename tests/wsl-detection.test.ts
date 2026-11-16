import { describe, expect, it } from 'vitest';
import {
  classifyWslKernelRelease,
  decodeWslCommandOutput,
  interpretWslDistroProbe,
  parseWslDistroNames,
  wslBytesToUtf8,
} from '../src/main/sandbox/wsl-detection';

function utf16le(text: string, withBom = false): Buffer {
  const body = Buffer.from(text, 'utf16le');
  if (!withBom) return body;
  return Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
}

describe('WSL distro list decoding', () => {
  it('reads a UTF-16LE list that starts with a BOM', () => {
    const decoded = decodeWslCommandOutput(utf16le('Ubuntu-24.04\n', true));
    expect(decoded).toBe('Ubuntu-24.04');
    expect(parseWslDistroNames(decoded)).toEqual(['Ubuntu-24.04']);
  });

  it('reads a UTF-16LE list without a BOM', () => {
    const decoded = decodeWslCommandOutput(utf16le('docker-desktop\nUbuntu-24.04\n'));
    expect(parseWslDistroNames(decoded)).toEqual(['docker-desktop', 'Ubuntu-24.04']);
  });

  it('reads a UTF-8 list unchanged', () => {
    expect(decodeWslCommandOutput(Buffer.from('Ubuntu\n', 'utf8'))).toBe('Ubuntu');
  });

  it('turns a UTF-16LE command result back into UTF-8 without trimming it', () => {
    const decoded = wslBytesToUtf8(utf16le('OK\n', true));
    expect(decoded.equals(Buffer.from('OK\n'))).toBe(true);
    expect(wslBytesToUtf8(Buffer.from('OK\n')).equals(Buffer.from('OK\n'))).toBe(true);
  });

  it('drops blank lines and names that are not distro identifiers', () => {
    expect(parseWslDistroNames('Ubuntu-24.04\n\nWindows Subsystem for Linux\n')).toEqual([
      'Ubuntu-24.04',
    ]);
  });
});

describe('WSL availability', () => {
  it('treats a responding WSL2 distro as available on win32', () => {
    expect(
      interpretWslDistroProbe({
        commandMissing: false,
        listFailed: false,
        listOutput: 'docker-desktop\nUbuntu-24.04',
        distroResponded: true,
        kernelRelease: '5.15.153.1-microsoft-standard-WSL2',
      })
    ).toEqual({ available: true, distro: 'Ubuntu-24.04' });
  });

  it('names WSL1 instead of claiming the platform is unsupported', () => {
    expect(
      interpretWslDistroProbe({
        commandMissing: false,
        listFailed: false,
        listOutput: 'Ubuntu',
        distroResponded: true,
        kernelRelease: '4.4.0-19041-Microsoft',
      })
    ).toEqual({ available: false, error: 'wsl1', distro: 'Ubuntu' });
    expect(classifyWslKernelRelease('6.6.87.2-microsoft-standard-WSL2')).toBe('wsl2');
    expect(classifyWslKernelRelease('')).toBe('unknown');
  });

  it('does not hide a working distro when uname cannot be read', () => {
    expect(
      interpretWslDistroProbe({
        commandMissing: false,
        listFailed: false,
        listOutput: 'Ubuntu-24.04',
        distroResponded: true,
        kernelRelease: null,
      })
    ).toEqual({ available: true, distro: 'Ubuntu-24.04' });
  });

  it('distinguishes a missing wsl command from an empty or unreadable list', () => {
    expect(
      interpretWslDistroProbe({
        commandMissing: true,
        listFailed: true,
        listOutput: '',
        distroResponded: false,
        kernelRelease: null,
      }).error
    ).toBe('not-installed');
    expect(
      interpretWslDistroProbe({
        commandMissing: false,
        listFailed: false,
        listOutput: '',
        distroResponded: false,
        kernelRelease: null,
      }).error
    ).toBe('no-distro');
    expect(
      interpretWslDistroProbe({
        commandMissing: false,
        listFailed: false,
        listOutput: 'ÿþUbuntu',
        distroResponded: false,
        kernelRelease: null,
      }).error
    ).toBe('unreadable-distros');
  });

  it('reports a listed distro that does not execute', () => {
    expect(
      interpretWslDistroProbe({
        commandMissing: false,
        listFailed: false,
        listOutput: 'Ubuntu-24.04',
        distroResponded: false,
        kernelRelease: null,
      })
    ).toEqual({ available: false, error: 'distro-not-responding', distro: 'Ubuntu-24.04' });
  });
});
