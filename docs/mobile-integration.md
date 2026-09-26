# Desktop and mobile in one repository

The Electron app remains at the repository root. The Expo / React Native app is under `mobile/`. Each app keeps its own package manifest, lockfile, dependencies, build configuration, tests, and runtime storage. This integration does not merge their UIs, databases, model installations, or release pipelines.

## Source and history

The import uses the published `main` branch of [speakspace-local-mobile](https://github.com/dhebhxh/speakspace-local-mobile). The initial import used revision `218a6be`; a later history-preserving update brought the subtree to revision `0fd7903`. The current integration preserves all 439 tracked files and the 111 commits reachable from the updated revision, including source code, native modules, plugins, tests, assets, documentation, and licence notices.

| Item | Revision |
| --- | --- |
| Desktop base | `1ee910326c517b71f24b2710720f6e7bf58c81df` |
| Initial mobile source | `218a6be2eaa3ae21d6ee88b38e4101e0b0a98b93` |
| Initial unmodified mobile tree | `52e6678086d1681a5c392b7f195dfc4e73805baf` |
| History-preserving import | `e6756ffc298b9b1e51823c11bca8fcd5c99781d9` |
| Updated mobile source | `0fd7903adc48eaaf15327ba7d83a6b8797726f61` |
| Updated upstream mobile tree | `672143183b2f6f6e3c0d56b31345d9ed44c166e2` |
| History-preserving update | `006dcf1015b0385b9ac5d0eb4d89b3d849be6e32` |
| Current integrated mobile tree | `b08272e90005fd1f8efe258180b425ed05c2bcf1` |

The import commit was made with `git subtree add --prefix=mobile` without squashing. Its second parent is the initial mobile source revision. Its `mobile/` tree is byte-for-byte identical to that source tree. The update was made with `git subtree pull --prefix=mobile` without squashing, and its second parent is the updated mobile source revision. The current integrated tree differs from the upstream tree only by two repository-level adjustments: a mobile `typecheck` command and nested-directory support in the auxiliary static-check helper.

Unmerged development branches and uncommitted local changes are not part of this import. The original repository remains intact. GitHub issues, pull requests, repository settings, tags, and uploaded release assets are not copied by a source import. Existing mobile release links continue to point to the original repository. The imported app retains its upstream product names and versions.

The mobile MIT notices remain in [`mobile/LICENSE`](../mobile/LICENSE) and [`mobile/modules/audio-converter/LICENSE`](../mobile/modules/audio-converter/LICENSE).

## Develop mobile

Use Node.js 24 and npm. No root dependency installation is required when working only on mobile.

```bash
git clone https://github.com/dhebhxh/speakspace-local-electron.git
cd speakspace-local-electron
npm run mobile:install
npm run mobile:start
```

`mobile:install` runs `npm ci` inside `mobile/`, using its committed lockfile and postinstall patches. Do not run those patch scripts from the repository root: some resolve dependencies relative to the current working directory.

| Command from the repository root | Purpose |
| --- | --- |
| `npm run mobile:install` | Install the locked mobile dependencies |
| `npm run mobile:start` | Start Expo / Metro |
| `npm run mobile:android` | Build and run Android with the Android SDK installed |
| `npm run mobile:ios` | Build and run iOS on macOS with Xcode installed |
| `npm run mobile:web` | Start the web target; native-only capabilities still require a native build |
| `npm run mobile:test` | Run the mobile Node test suite |
| `npm run mobile:typecheck` | Check mobile TypeScript without emitting files |
| `npm run mobile:lint` | Run mobile Expo / ESLint checks |
| `npm run check:apps` | Check repository-level application boundaries without installing either app |

For more detailed setup, device testing, signing, and packaging instructions, use the imported [mobile README](../mobile/README.md) and [mobile documentation](../mobile/docs/). Expo SDK 57's [versioned reference](https://docs.expo.dev/versions/v57.0.0/) describes its native platform requirements. Automated source checks do not replace device acceptance tests for recording, transcription, model downloads, or notifications.

## Keep the applications independent

- Root `npm install`, `npm start`, `npm test`, `npm run lint`, `npm run build`, and `npm run package` remain desktop commands.
- Root TypeScript, ESLint, and Jest exclude `mobile/`. Mobile checks use the configuration and dependencies inside that directory.
- The repository does not use npm workspaces or dependency hoisting. The apps use different React, TypeScript, and ESLint versions.
- Electron packaging still reads `release/app/` and the existing desktop resources. It does not package mobile source or mobile dependencies.
- [Mobile CI](../.github/workflows/mobile.yml) runs the boundary checks and the mobile install, tests, type check, and lint. The existing desktop workflow remains separate. Neither workflow added by this integration publishes a mobile release.

## Integration validation

The 2026-09-03 integration was checked on Windows with Node.js 24.16.0 and npm 11.13.0:

- The source import contained 415 files and 97 reachable mobile commits. The imported tree matched the source tree exactly before the two integration adjustments.
- Mobile `npm ci`, 142 tests, TypeScript, and ESLint passed. ESLint retained 12 existing React Hook dependency warnings and reported no errors.
- Expo produced both iOS and Android JavaScript/Hermes bundles from the nested `mobile/` path.
- The Electron main and renderer production builds, TypeScript, ESLint, and four application-boundary tests passed. ESLint retained the same 29 existing `no-console` warnings and reported no errors.
- Desktop Jest matched its pre-integration baseline: 571 tests passed, 74 were skipped, and one existing Windows runtime-path test failed because an installed Whisper binary took precedence over its temporary fixture.
- `npm ci` reported 19 advisories in the imported mobile dependency tree (18 moderate and one high). Dependency versions were not changed as part of this source integration.

The bundle checks do not compile Xcode or Android Studio projects. Native builds, signing, microphones, notifications, downloads, and on-device inference still require their platform-specific and physical-device acceptance runs.

The follow-up mobile sync on 2026-09-03 was checked from the nested `mobile/` path with the same Node.js and npm versions:

- `npm ci` applied all seven locked postinstall patches and retained the existing dependency audit result of 18 moderate and one high advisory.
- All 187 mobile tests and the TypeScript check passed.
- Mobile ESLint reported no errors and retained 12 existing React Hook dependency warnings.
- All four application-boundary tests passed.
- The integrated mobile tree matched revision `0fd7903` except for the two documented repository-level adjustments.

## Future upstream imports

If the original mobile repository continues to receive changes, review the desired revision and use a clean working tree before importing it. Do not overwrite `mobile/` by copying a local working directory. A history-preserving update can be made with:

```bash
git subtree pull --prefix=mobile https://github.com/dhebhxh/speakspace-local-mobile.git main
```

Resolve any conflicts with the integration changes, then run `npm run check:apps` and all three mobile checks. Changes to root configuration also require the desktop checks. This command is a manual maintenance option, not an automatic synchronisation service.
