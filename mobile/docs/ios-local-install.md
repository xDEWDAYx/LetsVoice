# Install LetsVoice on an iPhone

This workflow installs LetsVoice directly from a Mac. It does not use EAS,
TestFlight, or the App Store.

## Supported target

- iPhone only; iPad and Mac are not project targets
- Minimum deployment target: iOS 16.4
- Reference device: iPhone 16 Pro Max, iOS 27.0 beta 6
- A free Apple Personal Team is sufficient for local device testing

The project deliberately disables `llama.rn`'s optional Extended Virtual
Addressing and Increased Memory Limit entitlements. Apple does not make those
capabilities available to free Apple Developer provisioning profiles. This
keeps Release generation deterministic for a Personal Team; the reference
iPhone must still be used to confirm that the selected Qwen model stays within
the normal per-app memory limit.

The reference phone runs an iOS 27 beta. Use an Xcode version that can pair with
the installed device and mount its developer disk image. The final authority is
whether Xcode lists the phone as an available run destination and completes a
device build; do not infer compatibility from the SDK version string alone.

## 1. Prepare the Mac

Install Node.js, Xcode, and CocoaPods. If stable and beta Xcode are both
installed, check the beta path without changing the whole Mac's active Xcode:

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcodebuild -version
```

From the repository root:

```bash
npm ci
IOS_BUNDLE_IDENTIFIER=com.example.letsvoice.local \
  npx expo prebuild --platform ios
npx pod-install ios
open ios/LetsVoice.xcworkspace
```

Replace `com.example.letsvoice.local` with a unique reverse-DNS identifier for
the Apple Account used on that Mac. The repository default is the team-neutral
`com.dhebhxh.speakspacelocalmobile`; the environment variable prevents a local
Personal Team identifier from being committed. In PowerShell, use:

```powershell
$env:IOS_BUNDLE_IDENTIFIER = "com.example.letsvoice.local"
npx expo prebuild --platform ios
```

Open the `.xcworkspace`, not the `.xcodeproj`. The generated `ios/` directory is
intentionally ignored by Git; do not commit it.

## 2. Pair and sign the iPhone

1. Connect the iPhone by cable, tap **Trust** when asked, and pair it in Xcode's
   Device Hub.
2. On the iPhone, enable **Settings > Privacy & Security > Developer Mode** and
   complete the required restart.
3. In **Xcode > Settings > Apple Accounts**, add the Apple Account used for
   testing.
4. Select the `LetsVoice` project and app target, then open
   **Signing & Capabilities**.
5. Leave **Automatically manage signing** enabled and choose the appropriate
   Personal Team or development team.
6. Select the connected iPhone as the run destination.

If Xcode says the bundle identifier belongs to another team, use the group's
signing team or set `IOS_BUNDLE_IDENTIFIER` to a unique reverse-DNS identifier,
regenerate `ios/`, and select the team again. Do not commit a personal Team ID,
certificate, provisioning profile, or contributor-specific bundle identifier.

## 3. Choose the type of installation

### Development build

Use this while changing code. Metro must remain available while the app runs:

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
  npx expo run:ios --device
```

### Standalone local release build

Use this for a phone installation that can launch without Metro:

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
  npm run ios:device:release
```

This project command expands to `expo run:ios --device --configuration Release
--no-bundler`. Expo documents `--configuration Release` as its local production
configuration, and `--no-bundler` makes the Metro-free acceptance condition
explicit.

The CLI uses the signing selection stored in the generated Xcode workspace. If
signing has not been selected yet, configure it in Xcode first, select the
iPhone, change the Run action's build configuration to **Release**, and choose
**Product > Run**.

With free Personal Team signing, the development provisioning profile is
short-lived. When iOS reports that it has expired, reconnect the phone and run
the signed Release build again. No project or local app data should be deleted
as part of routine re-signing, but back up important test material before
removing or reinstalling the app because uninstalling the app removes its local
container.

After the command succeeds, copy the `.app` path printed by Expo and run the
signed-bundle verifier:

```bash
npm run verify:ios-release -- \
  /absolute/path/to/LetsVoice.app --require-signed
```

Record the remaining runtime results in
[`docs/ios-device-acceptance.md`](ios-device-acceptance.md). A Simulator result
must not be used to pass a physical-device row.

## 4. Package the team IPA

After the standalone `.app` passes the verifier, create the artifact that
Windows testers can re-sign with SideStore:

```bash
npm run package:ios:sidestore -- \
  /absolute/path/to/LetsVoice.app
```

The packager copies the app, removes the original `_CodeSignature` directories
and provisioning profile, validates the IPA layout, and writes both files below:

```text
dist/ios/LetsVoice-iOS-v1.6.2.ipa
dist/ios/LetsVoice-iOS-v1.6.2.ipa.sha256
```

Do not commit these binaries. Attach both files to the matching GitHub Release.
Windows testers follow
[`docs/ios-sidestore-windows.md`](ios-sidestore-windows.md).

## 5. First-run checks

1. Grant microphone permission.
2. Open **AI > Speech recognition models** and download/activate a model.
3. Confirm live transcription starts, pauses when the phone locks or the app
   leaves the foreground, and never resumes by itself.
4. Confirm a phone call or another audio interruption pauses the session and
   leaves it recoverable.
5. Import one short sample in each needed format: WAV, MP3, M4A, AAC, and FLAC.
6. Confirm an unsupported extension, a file over 2 GB, and audio over two hours
   are rejected without leaving a note or converted file behind.
7. Confirm low-storage errors explain the required space and do not delete any
   model, recording, note, or workspace.

## 6. Chinese acceptance sample

Download and activate **Whisper Small Multilingual (F16)**. For both live audio
and file import, use a 1–2 minute Mandarin sample containing 10 independently
checkable facts.

The acceptance threshold is:

- at least 8 of 10 facts are transcribed correctly;
- no key fact is fabricated;
- the app does not crash, freeze, or remain stuck in a busy state;
- the transcript and saved audio remain available after reopening the app.

The model file is about 488 MB and is downloaded only when the user requests
it. Model downloads may use Wi-Fi or cellular data. User-created content stays
inside the app's local container.

## Troubleshooting

- **The iOS 27 phone is unavailable or the developer disk image is missing:**
  run the command with Xcode 27 beta/newer and verify `DEVELOPER_DIR`.
- **No signing certificate or profile:** add the Apple Account, choose a Team,
  keep automatic signing enabled, and register the connected device when Xcode
  offers to do so.
- **Native module not found:** stop Metro, run `npx expo prebuild --platform
  ios` and `npx pod-install ios`, rebuild, then start the app again.
- **The development build opens a launcher or cannot find JavaScript:** start
  Metro with `npx expo start --dev-client`; use a Release build when Metro-free
  operation is required.
- **A model cannot download:** verify network access and free storage. The app
  retains a 256 MB safety reserve in addition to the estimated operation size.
  Keep LetsVoice visible until the download finishes; leaving the foreground
  may stop a model transfer, after which it can be started again safely.
