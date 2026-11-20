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

const spawnsAny = /\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync|fork)\(/;
const base = file => file.split('/').pop();
const escaped = file => base(file).replaceAll('.', '\\.');

const runsScript = (text, hostBound) => spawnsAny.test(text) && hostBound.some(file => new RegExp(`['"\`/]${escaped(file)}['"\`]`).test(text));

// A host-bound script (such as workflow.mjs) is run as a child process, not imported: a test, or a support module it
// imports, that spawns one by name reaches the host binary just as a direct spawn does.
export function scriptRunners(sources, hostBound) {
  return Object.entries(sources).filter(([, text]) => runsScript(text, hostBound)).map(([file]) => file);
}

export function unstubbedHostTests(tests, hostBound, runners = []) {
  const imports = files => text => files.some(file => new RegExp(`from\\s+['"][^'"]*/${escaped(file)}['"]`).test(text));
  const importsHostBound = imports(hostBound);
  const importsRunner = imports(runners);
  return Object.entries(tests)
    .filter(([, text]) => (spawns.test(text) || shell.test(text) || importsHostBound(text) || importsRunner(text) || runsScript(text, hostBound)) && !stubbed.test(text))
    .map(([file]) => file);
}
