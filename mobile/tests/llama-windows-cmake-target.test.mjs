import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cmakePath = new URL(
  "../node_modules/llama.rn/android/src/main/CMakeLists.txt",
  import.meta.url,
);
const patchPath = new URL(
  "../scripts/patch-llama-windows-cmake-target.mjs",
  import.meta.url,
);

test("Windows llama builds shorten only the internal CMake target", async () => {
  const [source, patch] = await Promise.all([
    readFile(cmakePath, "utf8"),
    readFile(patchPath, "utf8"),
  ]);

  for (const value of [source, patch]) {
    assert.match(value, /CMAKE_HOST_WIN32/);
    assert.match(value, /rnllama_jni_hx_ocl/);
    assert.match(
      value,
      /set_target_properties\([^\n]+OUTPUT_NAME \$\{jni_name\}\)/,
    );
  }

  assert.match(
    source,
    /build_rnllama_jni\("rnllama_jni_v8_2_dotprod_i8mm_hexagon_opencl"/,
  );
});
