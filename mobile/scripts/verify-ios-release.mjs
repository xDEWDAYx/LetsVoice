#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MINIMUM_IOS_VERSION = "16.4";
const FORBIDDEN_ENTITLEMENTS = [
  "com.apple.developer.kernel.extended-virtual-addressing",
  "com.apple.developer.kernel.increased-memory-limit",
];

export function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function validateInfoPlist(info) {
  const failures = [];
  const warnings = [];
  const deviceFamily = info.UIDeviceFamily;

  if (!Array.isArray(deviceFamily) || deviceFamily.length !== 1 || deviceFamily[0] !== 1) {
    failures.push(`UIDeviceFamily must be exactly [1] for an iPhone-only build; received ${JSON.stringify(deviceFamily)}.`);
  }

  if (typeof info.MinimumOSVersion !== "string") {
    failures.push("MinimumOSVersion is missing from Info.plist.");
  } else if (compareVersions(info.MinimumOSVersion, MINIMUM_IOS_VERSION) < 0) {
    failures.push(`MinimumOSVersion ${info.MinimumOSVersion} is lower than ${MINIMUM_IOS_VERSION}.`);
  }

  if (Array.isArray(info.UIBackgroundModes) && info.UIBackgroundModes.length > 0) {
    failures.push(`Release build unexpectedly declares UIBackgroundModes: ${info.UIBackgroundModes.join(", ")}.`);
  }
  if (Array.isArray(info.NSBonjourServices) && info.NSBonjourServices.length > 0) {
    failures.push(`Release build unexpectedly declares Bonjour services: ${info.NSBonjourServices.join(", ")}.`);
  }
  if (typeof info.NSLocalNetworkUsageDescription === "string") {
    failures.push("Release build unexpectedly declares local-network privacy access.");
  }

  const transportSecurity = info.NSAppTransportSecurity;
  if (transportSecurity?.NSAllowsArbitraryLoads === true) {
    failures.push("Release build enables unrestricted App Transport Security loads.");
  }
  if (transportSecurity?.NSAllowsLocalNetworking === true) {
    warnings.push(
      "Expo's generated ATS dictionary allows local networking, but the Release build has no Bonjour or local-network privacy declaration. Keep the application-owned network audit limited to model catalogs and downloads.",
    );
  }

  return { failures, warnings };
}

export function validateArchitecture(fileDescription) {
  const failures = [];
  if (!fileDescription.includes("Mach-O 64-bit executable arm64")) {
    failures.push("The app executable is not an arm64 iPhone binary.");
  }
  if (fileDescription.includes("x86_64")) {
    failures.push("The device Release executable unexpectedly contains the simulator x86_64 architecture.");
  }
  return failures;
}

function readPlistAsJson(plistPath) {
  const output = execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", plistPath], {
    encoding: "utf8",
  });
  return JSON.parse(output);
}

function readEntitlements(appPath) {
  const result = spawnSync("/usr/bin/codesign", ["-d", "--entitlements", "-", "--xml", appPath], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;

  const start = result.stdout.indexOf("<?xml");
  if (start < 0) return {};
  const plist = result.stdout.slice(start);
  const converted = spawnSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "-"], {
    encoding: "utf8",
    input: plist,
  });
  if (converted.status !== 0) return {};
  return JSON.parse(converted.stdout);
}

export function verifyRelease(appArgument, { requireSigned = false } = {}) {
  const failures = [];
  const warnings = [];
  const appPath = resolve(appArgument);

  if (!existsSync(appPath) || !statSync(appPath).isDirectory() || !appPath.endsWith(".app")) {
    return {
      appPath,
      failures: [`${appPath} is not an iOS .app directory.`],
      warnings,
      details: {},
    };
  }

  const infoPath = join(appPath, "Info.plist");
  if (!existsSync(infoPath)) {
    return { appPath, failures: [`${infoPath} does not exist.`], warnings, details: {} };
  }

  const info = readPlistAsJson(infoPath);
  const infoResult = validateInfoPlist(info);
  failures.push(...infoResult.failures);
  warnings.push(...infoResult.warnings);

  const executableName = info.CFBundleExecutable;
  const executablePath = typeof executableName === "string" ? join(appPath, executableName) : "";
  if (!executablePath || !existsSync(executablePath)) {
    failures.push("CFBundleExecutable is missing or does not point to a file in the app bundle.");
  } else {
    const fileDescription = execFileSync("/usr/bin/file", [executablePath], { encoding: "utf8" });
    failures.push(...validateArchitecture(fileDescription));
  }

  if (!existsSync(join(appPath, "main.jsbundle"))) {
    failures.push("main.jsbundle is missing; this build would depend on Metro instead of launching standalone.");
  }

  const signature = spawnSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath], {
    encoding: "utf8",
  });
  const isSigned = signature.status === 0;
  if (!isSigned) {
    const message = "The app is not validly signed. This is expected for CODE_SIGNING_ALLOWED=NO verification builds, but not for an app installed on the reference iPhone.";
    if (requireSigned) failures.push(message);
    else warnings.push(message);
  }

  if (requireSigned && !existsSync(join(appPath, "embedded.mobileprovision"))) {
    failures.push("A signed local-device build must contain embedded.mobileprovision.");
  }

  const entitlements = isSigned ? readEntitlements(appPath) : null;
  if (entitlements) {
    for (const entitlement of FORBIDDEN_ENTITLEMENTS) {
      if (entitlements[entitlement] === true) {
        failures.push(`Free Personal Team build unexpectedly requests ${entitlement}.`);
      }
    }
  }

  return {
    appPath,
    failures,
    warnings,
    details: {
      bundleIdentifier: info.CFBundleIdentifier,
      executable: executableName,
      minimumOSVersion: info.MinimumOSVersion,
      deviceFamily: info.UIDeviceFamily,
      isSigned,
      embeddedBundleBytes: existsSync(join(appPath, "main.jsbundle"))
        ? statSync(join(appPath, "main.jsbundle")).size
        : 0,
    },
  };
}

function printUsage() {
  console.error("Usage: npm run verify:ios-release -- /absolute/path/to/LetsVoice.app [--require-signed]");
}

function main() {
  const argumentsWithoutFlags = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  const appArgument = argumentsWithoutFlags[0];
  if (!appArgument) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const result = verifyRelease(appArgument, {
    requireSigned: process.argv.slice(2).includes("--require-signed"),
  });
  console.log(`iOS Release: ${basename(result.appPath)}`);
  console.log(JSON.stringify(result.details, null, 2));
  for (const warning of result.warnings) console.warn(`WARNING: ${warning}`);
  for (const failure of result.failures) console.error(`FAIL: ${failure}`);

  if (result.failures.length > 0) {
    process.exitCode = 1;
    return;
  }
  console.log("PASS: The app bundle satisfies the automated iPhone Release checks.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
