// The suite's stubs for host binaries. Tests never run the machine's real `lsof`, `ps` and the like: their output differs
// between Linux CI and a Mac, so a test that depends on it passes in one place and fails in the other.
// Importing this module puts silent stubs first on PATH for the test process and every child it spawns.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

export const HOST_BINARIES = ['lsof', 'ps', 'ioreg', 'xcrun', 'adb'];

// A stub finds nothing: it prints nothing and exits 1, as the real tool does for "no such process" or "no device".
export function writeHostStubs(directory) {
  mkdirSync(directory, { recursive: true });
  for (const name of HOST_BINARIES) writeFileSync(join(directory, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  return directory;
}

export function installHostStubs() {
  const directory = writeHostStubs(mkdtempSync(join(tmpdir(), 'host-stubs-')));
  process.env.PATH = `${directory}${delimiter}${process.env.PATH ?? ''}`;
  return directory;
}

installHostStubs();
