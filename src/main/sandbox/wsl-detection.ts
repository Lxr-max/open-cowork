/**
 * Decide whether this Windows machine can run the WSL sandbox.
 *
 * There is no OS allowlist. win32/x64 is supported when a WSL2 distro
 * answers a command. `wsl --list` writes UTF-16LE, often with a BOM; treating
 * that byte stream as UTF-8 drops every distro name and looks like "WSL is
 * not installed".
 */

export type WslAvailabilityError =
  | 'not-installed'
  | 'no-distro'
  | 'unreadable-distros'
  | 'distro-not-responding'
  | 'wsl1';

export type WslKernelClass = 'wsl1' | 'wsl2' | 'unknown';

const DISTRO_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * `wsl.exe` writes UTF-16LE when its stdout is a pipe, unless `WSL_UTF8=1`
 * is set. File and command bytes have to keep their trailing newline.
 */
export function wslBytesToUtf8(buffer: Buffer): Buffer {
  if (!looksLikeUtf16Le(buffer)) return buffer;
  let text = buffer.toString('utf16le');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.split('\u0000').join('');
  return Buffer.from(text, 'utf8');
}

export function decodeWslCommandOutput(buffer: Buffer | string): string {
  const text = typeof buffer === 'string' ? buffer : wslBytesToUtf8(buffer).toString('utf8');
  return text
    .replace(/^\uFEFF/, '')
    .split('\u0000')
    .join('')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

export function parseWslDistroNames(decoded: string): string[] {
  const names: string[] = [];
  for (const line of decoded.split('\n')) {
    const name = line.trim().replace(/^\uFEFF/, '');
    if (!DISTRO_NAME.test(name) || names.includes(name)) continue;
    names.push(name);
  }
  return names;
}

/**
 * WSL2's kernel release contains `microsoft-standard` (usually also `WSL2`).
 * WSL1 looks like `4.4.0-19041-Microsoft`. Anything else is left unknown so a
 * failed `uname` probe does not hide a working WSL2 distro.
 */
export function classifyWslKernelRelease(release: string): WslKernelClass {
  const normalized = release.trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized.includes('microsoft-standard') || normalized.includes('wsl2')) return 'wsl2';
  if (normalized.includes('microsoft')) return 'wsl1';
  return 'unknown';
}

export function preferUbuntuDistro(distros: readonly string[]): string | undefined {
  return distros.find((name) => name.toLowerCase().includes('ubuntu')) || distros[0];
}

export function interpretWslDistroProbe(input: {
  commandMissing: boolean;
  listFailed: boolean;
  listOutput: string;
  distroResponded: boolean;
  kernelRelease: string | null;
}): { available: boolean; error?: WslAvailabilityError; distro?: string } {
  if (input.commandMissing) {
    return { available: false, error: 'not-installed' };
  }
  if (input.listFailed && !input.listOutput.trim()) {
    return { available: false, error: 'distro-not-responding' };
  }

  const distros = parseWslDistroNames(input.listOutput);
  if (distros.length === 0) {
    return {
      available: false,
      error: input.listOutput.trim() ? 'unreadable-distros' : 'no-distro',
    };
  }

  const distro = preferUbuntuDistro(distros);
  if (!input.distroResponded) {
    return { available: false, error: 'distro-not-responding', distro };
  }
  if (classifyWslKernelRelease(input.kernelRelease || '') === 'wsl1') {
    return { available: false, error: 'wsl1', distro };
  }
  return { available: true, distro };
}

function looksLikeUtf16Le(buffer: Buffer): boolean {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return true;
  const sampleLength = Math.min(buffer.length, 64);
  let oddNulls = 0;
  let oddBytes = 0;
  for (let index = 1; index < sampleLength; index += 2) {
    oddBytes += 1;
    if (buffer[index] === 0) oddNulls += 1;
  }
  return oddBytes >= 2 && oddNulls / oddBytes >= 0.6;
}
