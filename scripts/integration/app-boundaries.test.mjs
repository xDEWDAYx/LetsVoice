import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));
const desktop = json('package.json');
const mobile = json('mobile/package.json');

test('desktop checks exclude the independently configured mobile application', () => {
  assert.ok(json('tsconfig.json').exclude.includes('mobile'));
  assert.ok(read('.eslintignore').split(/\r?\n/).includes('/mobile/'));
  assert.ok(desktop.jest.testPathIgnorePatterns.includes('<rootDir>/mobile/'));
  assert.ok(
    desktop.jest.modulePathIgnorePatterns.includes('<rootDir>/mobile/'),
  );
});

test('mobile entry points execute in the mobile package', () => {
  const commands = {
    install: 'ci',
    start: 'start',
    android: 'run android',
    ios: 'run ios',
    web: 'run web',
    test: 'test',
    typecheck: 'run typecheck',
    lint: 'run lint',
  };
  Object.entries(commands).forEach(([name, command]) => {
    assert.equal(
      desktop.scripts[`mobile:${name}`],
      `npm --prefix mobile ${command}`,
    );
    if (name !== 'install') assert.ok(mobile.scripts[name]);
  });
  assert.equal(mobile.scripts.typecheck, 'tsc --noEmit');
});

test('each application retains an independent dependency lockfile', () => {
  assert.equal(desktop.workspaces, undefined);
  assert.equal(mobile.workspaces, undefined);
  ['', 'mobile/'].forEach((prefix) => {
    const manifest = json(`${prefix}package.json`);
    const locked = json(`${prefix}package-lock.json`).packages[''];
    assert.deepEqual(locked.dependencies, manifest.dependencies);
    assert.deepEqual(locked.devDependencies, manifest.devDependencies);
  });
});

test('mobile source attribution and nested static checks are retained', () => {
  assert.match(read('mobile/LICENSE'), /MIT License/);
  assert.match(read('mobile/modules/audio-converter/LICENSE'), /MIT License/);
  assert.match(
    read('mobile/.agents/skills/expo-skill-eval/scripts/check-static.sh'),
    /git diff --relative --name-only HEAD/,
  );
});
