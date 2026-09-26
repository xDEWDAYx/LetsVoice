import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const targets = [
  {
    path: resolve("node_modules/expo-dev-launcher/plugin/src/withDevLauncher.ts"),
    shellPath: "      shellPath: '/bin/sh',",
    inputPath:
      "      inputPaths: ['\"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)\"'],",
  },
  {
    path: resolve("node_modules/expo-dev-launcher/plugin/build/withDevLauncher.js"),
    shellPath: "            shellPath: '/bin/sh',",
    inputPath:
      "            inputPaths: ['\"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)\"'],",
  },
];

for (const target of targets) {
  const source = readFileSync(target.path, "utf8");
  const patchedBlock = `${target.inputPath}\n${target.shellPath}`;
  const patchedCount = source.split(patchedBlock).length - 1;

  if (patchedCount === 1) {
    continue;
  }

  const shellPathCount = source.split(target.shellPath).length - 1;
  if (patchedCount !== 0 || shellPathCount !== 1) {
    throw new Error(
      `expo-dev-launcher plugin changed at ${target.path}; review the Release Info.plist ordering patch before installing dependencies.`,
    );
  }

  writeFileSync(target.path, source.replace(target.shellPath, patchedBlock));
}

console.log("expo-dev-launcher Release Info.plist ordering patch is applied");
