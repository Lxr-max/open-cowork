#!/usr/bin/env node

/**
 * Fail when a packaged Mac app does not match the requested architecture.
 *
 * Usage: node scripts/verify-macos-arch.js <Open Cowork.app|release/mac-x64> <arm64|x64>
 */

'use strict';

const { verifyMacApp } = require('./macos-packaging');

function main() {
  const target = process.argv[2];
  const arch = process.argv[3];
  if (!target || !arch) {
    console.error('usage: verify-macos-arch.js <app-or-release-dir> <arm64|x64>');
    process.exit(2);
  }

  const result = verifyMacApp(target, arch);
  for (const note of result.notes) {
    console.log(note);
  }
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`::error::${error}`);
    }
    process.exit(1);
  }
  console.log(`Verified ${arch} app (${result.expected}): ${result.appPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`::error::${error && error.message ? error.message : error}`);
    process.exit(1);
  }
}
