import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL(
  "../src/app/workspaces/index.tsx",
  import.meta.url,
);
const editorModalPath = new URL(
  "../src/components/safe-area-modal.tsx",
  import.meta.url,
);

test("new workspace form is a safe-area-aware centered dialog", async () => {
  const [source, editorModal] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(editorModalPath, "utf8"),
  ]);

  assert.match(source, /<SafeAreaModal[\s\S]*androidPresentation="center"/);
  assert.doesNotMatch(source, /autoFocus/);
  assert.match(editorModal, /Platform\.OS === "ios" \|\| androidPresentation === "center"/);
  assert.match(editorModal, /paddingTop: Spacing\.lg \+ insets\.top/);
  assert.match(editorModal, /paddingBottom: Spacing\.lg \+ insets\.bottom/);
  assert.match(editorModal, /accessibilityViewIsModal/);
  assert.match(editorModal, /centeredDismissArea:[\s\S]*justifyContent: "center"/);
  assert.match(editorModal, /centeredCard:[\s\S]*borderRadius: Radius\.lg/);
});
