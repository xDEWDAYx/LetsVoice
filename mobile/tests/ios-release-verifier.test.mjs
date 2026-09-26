import assert from "node:assert/strict";
import test from "node:test";

import {
  compareVersions,
  validateArchitecture,
  validateInfoPlist,
} from "../scripts/verify-ios-release.mjs";

test("version comparison handles iOS deployment versions", () => {
  assert.equal(compareVersions("16.4", "16.4"), 0);
  assert.equal(compareVersions("17.0", "16.4"), 1);
  assert.equal(compareVersions("16.3.9", "16.4"), -1);
});

test("valid iPhone-only Release metadata passes with an Expo ATS notice", () => {
  const result = validateInfoPlist({
    UIDeviceFamily: [1],
    MinimumOSVersion: "16.4",
    NSAppTransportSecurity: {
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: true,
    },
  });

  assert.deepEqual(result.failures, []);
  assert.equal(result.warnings.length, 1);
});

test("iPad, background, Bonjour, and unrestricted network metadata are rejected", () => {
  const result = validateInfoPlist({
    UIDeviceFamily: [1, 2],
    MinimumOSVersion: "16.3",
    UIBackgroundModes: ["audio"],
    NSBonjourServices: ["_expo._tcp"],
    NSLocalNetworkUsageDescription: "development",
    NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
  });

  assert.equal(result.failures.length, 6);
});

test("device Release architecture must be arm64 without simulator slices", () => {
  assert.deepEqual(validateArchitecture("Mach-O 64-bit executable arm64"), []);
  assert.equal(
    validateArchitecture("Mach-O universal binary with 2 architectures: [x86_64] [arm64]").length,
    2,
  );
});
