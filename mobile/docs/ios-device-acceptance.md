# iPhone 16 Pro Max acceptance record

Use this record for the final physical-device gate. Do not mark a row as passed
from a Simulator result. Keep completed records with the group project notes;
the app itself does not upload this information.

## Build and device metadata

| Field | Result |
| --- | --- |
| Test date | |
| Git commit | |
| Tester | |
| iPhone model | iPhone 16 Pro Max |
| Installed iOS build | 27.0 beta 6 |
| Xcode build | |
| Apple Team type | Personal Team / paid team |
| Bundle identifier | `com.dhebhxh.speakspacelocalmobile` or replacement |

Install the standalone build with the project command. Expo documents
`--configuration Release` as its local production configuration; this project
also passes `--no-bundler` so the test cannot accidentally depend on Metro.

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
  npm run ios:device:release
```

Copy the `.app` path printed by Expo and validate the signed bundle:

```bash
npm run verify:ios-release -- \
  /absolute/path/to/speakspacelocalmobile.app --require-signed
```

| Release gate | Pass/fail | Evidence or notes |
| --- | --- | --- |
| Installation succeeds with the selected team | | |
| App launches after the Mac and Metro are disconnected | | |
| Automated signed-bundle verifier passes | | |
| Microphone permission prompt is understandable | | |
| Force-quit and reopen preserves local notes and audio | | |

## Model and storage gates

| Gate | Pass/fail | Evidence or notes |
| --- | --- | --- |
| Whisper Small Multilingual F16 downloads over Wi-Fi | | |
| A cancelled/failed download can be restarted | | |
| Cellular download works without an additional confirmation dialog | | |
| Whisper activates and remains active after relaunch | | |
| Qwen 2.5 1.5B Q4_K_M downloads and activates | | |
| Qwen completes ten consecutive note questions without memory termination | | |
| Low-storage preflight explains the shortage and deletes nothing | | |
| Piper Huayan downloads, activates, and remains active after relaunch | | |

If Qwen is terminated by iOS memory pressure, record the exact model, prompt,
available device storage, and the last visible app state. Do not enable the
Extended Virtual Addressing or Increased Memory Limit entitlements on a free
Personal Team as a workaround; choose a smaller model or reduce context only
after the failure is reproduced and documented.

## Audio import matrix

Use real files rather than renamed extensions.

| Format | Duration | Size | Imported | Transcribed | Saved after relaunch | Notes |
| --- | ---: | ---: | --- | --- | --- | --- |
| WAV | | | | | | |
| MP3 | | | | | | |
| M4A | | | | | | |
| AAC | | | | | | |
| FLAC | | | | | | |

Also verify these rejection cases:

| Rejection gate | Pass/fail | Evidence or notes |
| --- | --- | --- |
| Unsupported extension is rejected before transcription | | |
| File larger than 2 GB is rejected | | |
| Audio longer than two hours is rejected and temporary output is removed | | |

## Mandarin quality gate

Use one natural 1–2 minute Mandarin recording with ten independently
checkable facts. Test the same content through live recording and file import.
Do not use the expected text as an inference prompt.

| # | Expected fact | Live transcript | Import transcript | Live correct | Import correct |
| ---: | --- | --- | --- | --- | --- |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 | | | | | |
| 9 | | | | | |
| 10 | | | | | |

| Quality gate | Pass/fail | Evidence or notes |
| --- | --- | --- |
| Live recording gets at least 8/10 facts correct | | |
| File import gets at least 8/10 facts correct | | |
| Neither transcript fabricates a key fact | | |
| Neither path crashes, freezes, or remains busy | | |

## Lifecycle and interruption gates

| Gate | Pass/fail | Evidence or notes |
| --- | --- | --- |
| Leaving the foreground pauses and preserves the session | | |
| Locking the phone pauses and preserves the session | | |
| Returning to the app does not resume automatically | | |
| Manual resume continues the preserved session | | |
| Phone call/audio interruption pauses and explains the state | | |
| Five-minute remaining warning appears | | |
| Two-hour limit automatically finishes the recording | | |
| Screen remains awake while active foreground recording runs | | |

## v1.2.0 targeted regression supplement

This supplement records the 2026-08-24 regression work for the Ask AI,
Structured Note, and editor-modal fixes. It does not mark the unfilled audio,
long-recording, or external SideStore rows above as passed.

| Field | Result |
| --- | --- |
| Test date | 2026-08-24 |
| App version | `1.2.0 (3)` |
| Device | iPhone 16 Pro Max, iOS 27.0 |
| Bundle identifier | `com.dhebhxh.speakspacelocalmobile` |
| Install method | Xcode-signed Release, same-bundle-ID overwrite |
| Test data | 3 fresh local notes; Chinese grounding, ordinary English prose, dense English intents |

| Targeted gate | Result | Evidence or notes |
| --- | --- | --- |
| Ask AI answers supported Chinese responsibility and date questions | PASS | Direct transcript evidence and bilingual automated regression; the device samples remain available for manual acceptance |
| Ask AI rejects unsupported questions without inventing facts | PASS | Negative and cross-subject automated cases |
| Ask AI waiting state and conversation restore | PASS | Queued/generating UI and SQLite repository/service tests |
| Structured Note ordinary and multi-intent inputs | PASS | 2 true-device tests in the ordinary/multi result bundle |
| Structured Note dense output recovery | PASS | 1 true-device dense-input test; output-limit and recursive recovery unit coverage |
| Structured Note cleanup and semantic filtering | PASS | 1 true-device cleanup test; completed/negated/noise filtering unit coverage |
| Move note and all blocking editor modals respect the iOS safe area | PASS | Shared `SafeAreaModal`, modal inventory regression test, physical-device layout check |
| Signed Release verifier and strict code-sign verification | PASS | iPhone-only, arm64, minimum iOS 16.4, embedded JS bundle, valid signature |
| Overwrite install preserves local model and notes | PASS | Device still contains Qwen model and exactly 3 fresh test notes |
| App launches without Metro and remains running | PASS | `devicectl` launch and process-list confirmation |
| Copied SQLite database integrity | PASS | `PRAGMA integrity_check` returned `ok` |

Local `.xcresult` bundles are intentionally not committed. The release record
and reproducible source/test commands remain in the repository.

## v1.3.0 targeted regression supplement

This supplement records the 2026-08-24 desktop-parity feature acceptance and
the final versioned Release installation. The complete XCUITest ran on the same
business source immediately before the metadata-only version/build bump; the
resulting `1.3.0 (4)` binary was then rebuilt, strictly verified, installed,
launched, and checked against the preserved device database. It does not mark
the unfilled audio, long-recording, or external SideStore rows above as passed.

| Field | Result |
| --- | --- |
| Test date | 2026-08-24 |
| App version | `1.3.0 (4)` |
| Device | iPhone 16 Pro Max, iOS 27.0 |
| Bundle identifier | `com.dhebhxh.speakspacelocalmobile` |
| Install method | Xcode-signed Release, same-bundle-ID overwrite |
| Test data | 4 Notes, 2 Workspaces, 1 three-Note conversation, 1 custom template, 1 Knowledge result, 3 Tasks |

| Targeted gate | Result | Evidence or notes |
| --- | --- | --- |
| Desktop-parity end-to-end XCUITest | PASS | One complete Release test passed in 140.056 seconds on the same business source before the metadata-only version bump |
| Signed Release verifier and strict code-sign verification | PASS | Version `1.3.0 (4)`; iPhone-only, arm64, minimum iOS 16.4, embedded JavaScript bundle, valid signature |
| Overwrite installation exposes the expected version | PASS | Device application inventory reports `1.3.0 (4)` |
| App launches without Metro | PASS | Installed Release launched through the Xcode device toolchain |
| Overwrite installation preserves feature data | PASS | Device retained all 4 Notes, 2 Workspaces, 1 conversation with 3 contexts and 2 messages, 1 template, 1 Knowledge result, and 3 Tasks |
| Copied SQLite database integrity | PASS | Schema v10; `PRAGMA integrity_check` returned `ok`; `PRAGMA foreign_key_check` returned no rows |
| Unsigned SideStore IPA validation | PASS | Version/build, arm64, iPhone device family, ZIP integrity, archive-entry scan, and independent SHA-256 recomputation passed |

The local `.xcresult`, signed app, provisioning material, and copied device
database are intentionally not committed. Reproducible test and packaging
commands remain in the release and development records.

## v1.4.0 targeted regression supplement

This supplement records the 2026-08-26 selected-feature acceptance and final
versioned Release installation. The feature XCUITests ran on the same business
source immediately before the metadata-only version/build bump. The final
`1.4.0 (5)` binary was then rebuilt from a clean Expo Prebuild, strictly
verified, installed, launched, and checked against the cleaned device database.
It does not mark the unfilled audio, long-recording, notification environment,
share-destination, or external SideStore rows above as passed.

| Field | Result |
| --- | --- |
| Test date | 2026-08-26 |
| App version | `1.4.0 (5)` |
| Device | iPhone 16 Pro Max, iOS 27.0 beta |
| Bundle identifier | `com.dhebhxh.speakspacelocalmobile` |
| Install method | Xcode Personal Team signed Release, same-bundle-ID overwrite |
| Final device data | 0 user-content rows, 0 preference rows, and one active STT, LLM, and TTS model configuration |

| Targeted gate | Result | Evidence or notes |
| --- | --- | --- |
| Selected-feature Node regression | PASS | 88 tests passed, 0 failed after the `1.4.0 (5)` metadata update |
| Calendar fallback Release XCUITest | PASS | Structured Note spinner, null structured timestamps, transcript fallback, Home deduplication, date selection, and source-Note navigation passed 1/1 in 62.337 seconds on the same business source |
| Clean English launch XCUITest | PASS | English `Private & Local` onboarding and enabled `Continue` passed 1/1 on the same business source |
| Clean unsigned iPhoneOS Release | PASS | Version/build, arm64, iPhone family, minimum iOS 16.4, and 4,785,256-byte embedded JavaScript bundle verified |
| SideStore IPA validation | PASS | 34,231,895-byte IPA; ZIP integrity, archive-entry scan, and independent SHA-256 `67e57fd017faf9d43141f9fcb0cb9460c7d7e7b17dd588090a0626f27470bb0a` verified |
| Signed Release verifier and strict code-sign verification | PASS | Final `1.4.0 (5)` app is iPhone-only arm64, contains a 4,785,254-byte JavaScript bundle, has a valid Personal Team signature, and has no `aps-environment` entitlement |
| Overwrite installation exposes exactly one expected app | PASS | Device inventory contains one SpeakSpace entry, version `1.4.0 (5)`, and no XCUITest runner or second SpeakSpace bundle |
| App launches without Metro and remains running | PASS | `devicectl` launch succeeded and process inventory reported the installed executable |
| Copied SQLite database integrity | PASS | Schema v12; `PRAGMA integrity_check` returned `ok`; `PRAGMA foreign_key_check` returned no rows |
| Clean post-test state | PASS | User-content tables and Expo preference storage contain 0 rows; one active STT, LLM, and TTS model configuration remains for subsequent user testing |

The app was not uninstalled during the final overwrite test, so the successful
database check also covers the same-bundle-ID upgrade path. Local build output,
signing material, copied databases, and XCUITest results are intentionally not
committed. The unsigned IPA and checksum are published only as GitHub Release
assets.

## Final decision

The iPhone migration passes only when every required row above passes, both
Mandarin paths meet the 8/10 threshold without a fabricated key fact, and no
unresolved crash or iOS memory termination remains.

- Final result: **PASS / FAIL**
- Blocking issue IDs or notes:
- Tester signature/date:

Sources:

- Expo CLI local Release build: <https://docs.expo.dev/more/expo-cli/#develop>
- Expo SDK 57 iOS configuration: <https://docs.expo.dev/versions/v57.0.0/config/app/>
- Apple iOS capability availability: <https://developer.apple.com/help/account/reference/supported-capabilities-ios/>
