import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("native headers follow the active app theme and use icon-only back navigation", async () => {
  const [root, aiLayout, stackOptions, themeProvider, appConfig, gettingStarted, onboardingBack] = await Promise.all([
    read("src/app/_layout.tsx"),
    read("src/app/(tabs)/ai/_layout.tsx"),
    read("src/constants/themed-stack-options.ts"),
    read("src/providers/theme-provider.tsx"),
    read("app.json"),
    read("src/app/getting-started.tsx"),
    read("src/components/onboarding-model-back-button.tsx"),
  ]);

  assert.match(root, /ThemeProvider as NavigationThemeProvider/);
  assert.match(root, /card: colors\.background/);
  assert.match(root, /createThemedStackScreenOptions\(theme\.mode\)/);
  assert.match(aiLayout, /createThemedStackScreenOptions\(theme\.mode, true\)/);

  assert.match(stackOptions, /DynamicColorIOS/);
  assert.match(stackOptions, /light: Colors\.light\.background/);
  assert.match(stackOptions, /dark: Colors\.dark\.background/);
  assert.match(stackOptions, /headerStyle: \{ backgroundColor: nativeColors\.background \}/);
  assert.match(stackOptions, /headerTintColor: nativeColors\.accent/);
  assert.match(stackOptions, /headerBackButtonDisplayMode: "minimal"/);
  assert.match(stackOptions, /controlsStatusBar = false/);
  assert.match(stackOptions, /if \(controlsStatusBar\)/);
  assert.match(stackOptions, /screenOptions\.statusBarStyle = mode === "dark" \? "light" : "dark"/);
  assert.match(appConfig, /"UIViewControllerBasedStatusBarAppearance": true/);
  assert.match(root, /import \{ StatusBar \} from "expo-status-bar"/);
  assert.match(root, /<StatusBar[\s\S]*?style=\{theme\.mode === "dark" \? "light" : "dark"\}/);
  assert.doesNotMatch(`${root}\n${aiLayout}`, /headerBackTitle/);

  assert.match(themeProvider, /Appearance\.setColorScheme/);
  assert.match(themeProvider, /preference === "system" \? "unspecified" : preference/);
  assert.match(themeProvider, /applyNativeAppearance\(next\);\s*setPreferenceState\(next\);/);
  assert.match(themeProvider, /applyNativeAppearance\(previous\);\s*setPreferenceState\(previous\);/);

  assert.match(gettingStarted, /accessibilityLabel="Previous step"/);
  assert.match(gettingStarted, /name="chevron\.left"/);
  assert.match(onboardingBack, /accessibilityLabel="Back to Getting Started"/);
  assert.match(onboardingBack, /name="chevron\.left"/);
  assert.doesNotMatch(`${gettingStarted}\n${onboardingBack}`, /label="Back/);
});

test("appearance controls and the calendar update as one app theme", async () => {
  const [settings, home] = await Promise.all([
    read("src/app/(tabs)/settings.tsx"),
    read("src/app/(tabs)/index.tsx"),
  ]);

  assert.match(settings, /const APPEARANCE_OPTIONS:[\s\S]*?label: "Light"[\s\S]*?label: "Dark"[\s\S]*?label: "System"/);
  assert.match(settings, /<SettingsSegmentedControl[\s\S]*?accessibilityLabel="Appearance"/);
  assert.match(settings, /<SettingsSegmentedControl[\s\S]*?accessibilityLabel="Text Size"/);
  assert.doesNotMatch(settings, /Always use the (?:light|dark) appearance|Follow the iPhone appearance setting/);
  assert.doesNotMatch(settings, /styles\.(?:radio|radioDot)/);

  assert.match(home, /key=\{`\$\{language\}-\$\{theme\.mode\}`\}/);
  for (const themedCalendarToken of [
    "calendarBackground: colors.surface",
    "dayTextColor: colors.text",
    "monthTextColor: colors.text",
    "textSectionTitleColor: colors.textMuted",
    "selectedDayBackgroundColor: colors.accent",
  ]) {
    assert.ok(home.includes(themedCalendarToken), `missing calendar theme token: ${themedCalendarToken}`);
  }
});

test("workspace and Structured Note actions are compact without losing accessibility labels", async () => {
  const [workspace, note] = await Promise.all([
    read("src/app/workspaces/[workspaceId]/index.tsx"),
    read("src/app/notes/[noteId].tsx"),
  ]);

  assert.match(workspace, /accessibilityLabel="Create a new note"/);
  assert.match(workspace, /<SymbolView name="plus"/);
  assert.match(workspace, />Notes<\/Text>[\s\S]*?styles\.workspaceMetaRow[\s\S]*?state\.notes\.length[\s\S]*?Updated/);
  assert.match(workspace, /<Stack\.Toolbar placement="right">[\s\S]*?<Stack\.Toolbar\.Menu[\s\S]*?accessibilityLabel="More workspace actions"[\s\S]*?icon="ellipsis"/);
  assert.match(workspace, /<Stack\.Toolbar\.MenuAction icon="pencil" onPress=\{openRenameWorkspace\}>[\s\S]*?Rename Workspace[\s\S]*?<Stack\.Toolbar\.MenuAction destructive icon="trash" onPress=\{confirmDeleteWorkspace\}>[\s\S]*?Move to Trash/);
  assert.doesNotMatch(workspace, /accessibilityLabel="Rename workspace"|accessibilityLabel="Delete workspace"|styles\.actionRow|styles\.iconButton/);
  assert.doesNotMatch(workspace, /workspaceMetaRow: \{[^}]*flex: 1/);
  assert.doesNotMatch(workspace, /label="＋ New note"/);

  assert.match(note, /<Stack\.Screen options=\{\{ title: "Note" \}\} \/>/);
  assert.doesNotMatch(note, /Summary, key points, and tasks\./);
  assert.match(note, /structuredNoteHeading: \{ alignItems: "center"/);
  assert.match(note, /<Stack\.Toolbar placement="right">[\s\S]*?<Stack\.Toolbar\.Menu[\s\S]*?accessibilityLabel="More note actions"[\s\S]*?icon="ellipsis"/);
  assert.match(note, /<Stack\.Toolbar\.MenuAction[\s\S]*?>\s*Export PDF\s*<\/Stack\.Toolbar\.MenuAction>[\s\S]*?>\s*Move to Workspace\s*<\/Stack\.Toolbar\.MenuAction>[\s\S]*?<Stack\.Toolbar\.MenuAction\s*destructive[\s\S]*?>\s*Move to Trash\s*<\/Stack\.Toolbar\.MenuAction>/);
  assert.match(note, /accessibilityLabel="Creating PDF"[\s\S]*?accessibilityRole="progressbar"/);
  assert.match(note, /accessibilityLabel="Rename note title"[\s\S]*?onPress=\{beginTitleEditing\}/);
  assert.match(note, /accessibilityLabel="Cancel title editing"/);
  assert.match(note, /accessibilityLabel=\{isRenaming \? "Saving note title" : "Save note title"\}/);
  assert.match(note, /usePreventRemove\(isEditingTitle && \(titleHasChanges \|\| isRenaming\)[\s\S]*?Discard title changes\?/);
  assert.match(note, /const \[isRenaming, setIsRenaming\] = useState\(false\)/);
  assert.match(note, /const \[isLoadingWorkspaces, setIsLoadingWorkspaces\] = useState\(false\)/);
  assert.match(note, /Loading workspaces…/);
  assert.match(note, /dismissDisabled=\{isLoadingWorkspaces \|\| isMoving\}/);
  assert.match(note, /<ModalCloseButton[\s\S]*?label="Close Move Note"/);
  assert.match(note, /<ModalCloseButton[\s\S]*?label="Close Note Category"/);
  assert.match(note, /<NotePrimaryAction[\s\S]*?shortLabel=\{playerStatus\.playing \? "Pause" : "Audio"\}/);
  assert.match(note, /<NotePrimaryAction[\s\S]*?shortLabel="Ask AI"/);
  assert.match(note, /styles\.noteIdentityRow[\s\S]*?styles\.noteIdentity[\s\S]*?styles\.workspaceName[\s\S]*?styles\.noteMetaRow[\s\S]*?styles\.categoryControl[\s\S]*?formatCompactDateTime\(state\.note\.getCreatedAt\(\)\)[\s\S]*?styles\.noteQuickActions[\s\S]*?<NotePrimaryAction/);
  assert.match(note, /categoryControl: \{[^}]*minHeight: 44/);
  assert.match(note, /categoryBadge: \{[^}]*borderRadius: 999/);
  assert.doesNotMatch(note, /styles\.noteCommandBar|noteCommandBar:/);
  assert.doesNotMatch(note, /actionModal === "rename"|<NoteIconAction/);
  assert.match(note, /adjustsFontSizeToFit minimumFontScale=\{0\.82\} numberOfLines=\{1\}[\s\S]*?formatCompactDateTime\(state\.note\.getCreatedAt\(\)\)/);
  assert.doesNotMatch(note, /Created \{format/);
  assert.match(note, /style=\{styles\.insightActionRow\}/);
  assert.match(note, /<TranslationActionButton[\s\S]*?compact[\s\S]*?section="insights"/);
  assert.match(note, /<CopyInsightsButton[^>]*compact/);
  assert.match(note, /const speechId = `structured-note:/);
  assert.match(note, /accessibilityLabel=\{speechLabel\}/);
  assert.match(note, /name=\{speechPlaying \? "stop\.fill"/);
  assert.match(note, /speechPreparing \? \([\s\S]*?<ActivityIndicator size="small"/);
  assert.match(note, /state\.errorCode === "missing-model"/);
  assert.match(note, /accessibilityLabel="Open Text-to-Speech Models"/);
  assert.match(note, /ios: "translate", android: "translate", web: "translate"/);
  assert.match(note, /backgroundColor: translated \? colors\.accent : colors\.accentSoft/);
  assert.match(note, /\{!compact && <Text[\s\S]*?copyState === "copied" \? "Copied" : "Copy"/);
  assert.match(note, /insightIconButton: \{[^}]*height: 44[^}]*width: 44/);
  assert.match(note, /translationActionButtonCompact: \{[^}]*height: 44[^}]*width: 44/);
  assert.match(note, /copyButtonCompact: \{[^}]*height: 44[^}]*width: 44/);
  assert.match(note, /selected === undefined \? \{\} : \{ selected \}/);
  assert.match(note, /styles\.insightTabIndicator/);
  assert.match(note, /accessibilityRole="tab"/);
  assert.doesNotMatch(note, />Copy insights<|label=\{state\.coreInsights \? "Regenerate Core Insights"/);
});
