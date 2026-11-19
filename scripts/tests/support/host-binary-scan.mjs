import { HOST_BINARIES } from './host-stubs.mjs';

const names = HOST_BINARIES.join('|');
const spawns = new RegExp(`\\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync)\\(\\s*['"\`](?:${names})\\b`);
const shell = new RegExp(`-c['"\`]\\s*,\\s*['"\`]\\s*(?:${names})\\s`);
const stubbed = /support\/host-stubs\.mjs|writeHostStubs/;

// A production module is host-bound when it spawns a listed binary; a test that spawns one itself or imports such a
// module must use the suite's stub.
export function hostBoundModules(sources) {
  return Object.entries(sources).filter(([, text]) => spawns.test(text)).map(([file]) => file);
}

export function unstubbedHostTests(tests, hostBound) {
  const importsHostBound = text => hostBound.some(file => new RegExp(`from\\s+['"][^'"]*/${file.split('/').pop().replace('.', '\\.')}['"]`).test(text));
  return Object.entries(tests)
    .filter(([, text]) => (spawns.test(text) || shell.test(text) || importsHostBound(text)) && !stubbed.test(text))
    .map(([file]) => file);
}
