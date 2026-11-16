#!/usr/bin/env node

/**
 * electron-builder beforePack hook.
 *
 * Runs before app files are copied. When sharp is installed, the @img prebuild
 * for the arch being packed has to be on disk now: an Apple Silicon npm ci does
 * not download the Intel optional package. electron-builder then rebuilds
 * better-sqlite3 for this arch. afterPack removes @img packages for other arches.
 */

'use strict';

const { ensureSharpPrebuilds } = require('./rebuild-native');

const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 3: 'arm64' };

module.exports = async function beforePack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const arch = ARCH_NAMES[context.arch];
  if (!arch || arch === 'ia32') return;
  ensureSharpPrebuilds(context.electronPlatformName, arch);
};
