import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve("node_modules/llama.rn/android/src/main/CMakeLists.txt");

const functionStart =
  "function(build_rnllama_jni jni_name rnllama_name arch cpu_flags)";
const functionEnd = "endfunction()\n\n# Default target";
const aliasSetup = `${functionStart}
    # Keep the output library name intact, but shorten the internal CMake
    # target on Windows so Ninja object paths remain below MAX_PATH.
    set(cmake_target_name \${jni_name})
    if (CMAKE_HOST_WIN32 AND \${jni_name} STREQUAL "rnllama_jni_v8_2_dotprod_i8mm_hexagon_opencl")
        set(cmake_target_name "rnllama_jni_hx_ocl")
    endif()`;
const outputName =
  "    set_target_properties(${cmake_target_name} PROPERTIES OUTPUT_NAME ${jni_name})";

const source = await readFile(target, "utf8");
const startIndex = source.indexOf(functionStart);
const endIndex = source.indexOf(functionEnd, startIndex);

if (startIndex < 0 || endIndex < 0) {
  throw new Error("llama.rn CMake structure changed; JNI builder was not found.");
}

const endOffset = endIndex + "endfunction()".length;
const functionSource = source.slice(startIndex, endOffset);

if (
  functionSource.includes("set(cmake_target_name ${jni_name})") &&
  functionSource.includes('set(cmake_target_name "rnllama_jni_hx_ocl")') &&
  functionSource.includes(outputName) &&
  !/target_(?:compile|include|link|link_directories|link_options)[^(]*\(\$\{jni_name\}/.test(
    functionSource,
  )
) {
  console.log("llama.rn Windows CMake target patch already applied");
  process.exit(0);
}

const replaceExactly = (value, oldText, newText, expectedCount, label) => {
  const actualCount = value.split(oldText).length - 1;
  if (actualCount !== expectedCount) {
    throw new Error(
      `llama.rn CMake changed; expected ${expectedCount} ${label} marker(s), found ${actualCount}.`,
    );
  }
  return value.replaceAll(oldText, newText);
};

let patchedFunction = replaceExactly(
  functionSource,
  functionStart,
  aliasSetup,
  1,
  "function declaration",
);
patchedFunction = replaceExactly(
  patchedFunction,
  "        ${jni_name}\n        SHARED",
  "        ${cmake_target_name}\n        SHARED",
  1,
  "add_library target",
);
patchedFunction = replaceExactly(
  patchedFunction,
  "    )\n\n    # Link JSI libraries",
  `    )
${outputName}

    # Link JSI libraries`,
  1,
  "output-name insertion",
);

for (const [command, expectedCount] of [
  ["target_link_libraries", 5],
  ["target_include_directories", 1],
  ["target_compile_options", 7],
  ["target_link_directories", 1],
  ["target_link_options", 3],
]) {
  patchedFunction = replaceExactly(
    patchedFunction,
    `${command}(\${jni_name}`,
    `${command}(\${cmake_target_name}`,
    expectedCount,
    command,
  );
}

const patched =
  source.slice(0, startIndex) + patchedFunction + source.slice(endOffset);
await writeFile(target, patched, "utf8");
console.log(
  "Patched llama.rn Windows CMake target length while preserving the .so name",
);
