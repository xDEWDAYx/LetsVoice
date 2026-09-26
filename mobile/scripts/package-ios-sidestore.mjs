#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const appPathArgument = process.argv[2];
const outputDirectoryArgument = process.argv[3] ?? "dist/ios";

if (!appPathArgument) {
  fail(
    "Usage: npm run package:ios:sidestore -- /absolute/path/to/LetsVoice.app [output-directory]",
  );
}

const appPath = resolve(appPathArgument);
const outputDirectory = resolve(outputDirectoryArgument);
const appName = basename(appPath);

if (!appName.endsWith(".app")) {
  fail(`Expected an .app bundle, received: ${appPath}`);
}

const appStats = await stat(appPath).catch(() => null);
if (!appStats?.isDirectory()) {
  fail(`The app bundle does not exist: ${appPath}`);
}

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const version = packageJson.version;
const artifactBaseName = `LetsVoice-iOS-v${version}`;
const ipaPath = join(outputDirectory, `${artifactBaseName}.ipa`);
const checksumPath = `${ipaPath}.sha256`;
const workingDirectory = await mkdtemp(
  join(tmpdir(), "letsvoice-sidestore-"),
);

try {
  const payloadDirectory = join(workingDirectory, "Payload");
  const copiedAppPath = join(payloadDirectory, appName);
  await mkdir(payloadDirectory, { recursive: true });
  await cp(appPath, copiedAppPath, {
    dereference: false,
    recursive: true,
  });

  await removeSigningArtifacts(copiedAppPath);
  validateApplicationBundle(copiedAppPath);

  await mkdir(outputDirectory, { recursive: true });
  await rm(ipaPath, { force: true });
  await rm(checksumPath, { force: true });

  run("/usr/bin/ditto", [
    "-c",
    "-k",
    "--norsrc",
    "--noextattr",
    "--noqtn",
    "--noacl",
    "--keepParent",
    payloadDirectory,
    ipaPath,
  ]);

  validateIpaArchive(ipaPath, appName);
  const digest = await sha256(ipaPath);
  await writeFile(
    checksumPath,
    `${digest}  ${basename(ipaPath)}\n`,
    "utf8",
  );

  const ipaStats = await stat(ipaPath);
  process.stdout.write(
    `${JSON.stringify(
      {
        artifact: ipaPath,
        bytes: ipaStats.size,
        checksum: checksumPath,
        sha256: digest,
        signingArtifactsRemoved: true,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await rm(workingDirectory, { force: true, recursive: true });
}

async function removeSigningArtifacts(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (
      entry.name === "_CodeSignature" ||
      entry.name === "embedded.mobileprovision" ||
      entry.name.endsWith(".mobileprovision")
    ) {
      await rm(entryPath, { force: true, recursive: true });
      continue;
    }

    if (entry.isDirectory()) {
      await removeSigningArtifacts(entryPath);
    }
  }
}

function validateApplicationBundle(copiedAppPath) {
  const infoPlistPath = join(copiedAppPath, "Info.plist");
  const packageType = run("/usr/bin/plutil", [
    "-extract",
    "CFBundlePackageType",
    "raw",
    "-o",
    "-",
    infoPlistPath,
  ]).trim();

  if (packageType !== "APPL") {
    fail(`The bundle is not an iOS application: ${copiedAppPath}`);
  }
}

function validateIpaArchive(ipaPath, appName) {
  run("/usr/bin/unzip", ["-tqq", ipaPath]);
  const entries = run("/usr/bin/unzip", ["-Z1", ipaPath])
    .split("\n")
    .filter(Boolean);
  const expectedInfoPlist = `Payload/${appName}/Info.plist`;

  if (!entries.includes(expectedInfoPlist)) {
    fail(`The IPA is missing ${expectedInfoPlist}.`);
  }
  if (entries.some((entry) => entry === "__MACOSX/" || entry.startsWith("__MACOSX/"))) {
    fail("The IPA contains macOS metadata under __MACOSX/.");
  }
  if (
    entries.some(
      (entry) =>
        entry.includes("/_CodeSignature/") ||
        entry.endsWith("embedded.mobileprovision") ||
        entry.endsWith(".mobileprovision"),
    )
  ) {
    fail("The IPA still contains signing or provisioning artifacts.");
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    fail(
      `${command} failed (${result.status ?? "unknown"}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  const input = createReadStream(filePath);
  for await (const chunk of input) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
