import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { AppButton } from "@/components/app-button";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { Colors, Radius, Shadows, Spacing } from "@/constants/theme";
import type { KnowledgeTemplateSection } from "@/domain/knowledge/knowledge-template";
import { useTheme } from "@/hooks/use-theme";
import { useTrashUndo } from "@/providers/trash-undo-provider";
import { InferenceCancelledError } from "@/services/local-llm-coordinator";

type Template = Awaited<ReturnType<typeof appContainer.knowledgeTemplateService.getTemplates>>[number];
type Editor = { id?: string; name: string; requirement: string; sections: KnowledgeTemplateSection[] };
type State = { status: "loading" } | { status: "error"; message: string } | { status: "success"; templates: Template[] };

export default function KnowledgeTemplatesScreen() {
  const colors = Colors[useTheme().mode];
  const insets = useSafeAreaInsets();
  const { showTrashUndo } = useTrashUndo();
  const [state, setState] = useState<State>({ status: "loading" });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState({ status: "success", templates: await appContainer.knowledgeTemplateService.getTemplates() });
    } catch (caught) {
      setState({ status: "error", message: caught instanceof Error ? caught.message : "Unable to load templates." });
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    void appContainer.knowledgeTemplateService.ensureReady().catch(() => undefined);
  }, [load]));

  const propose = async () => {
    if (!editor) return;
    setBusy(true);
    setProposing(true);
    setError(null);
    try {
      const sections = await appContainer.knowledgeTemplateService.proposeSections(editor.name, editor.requirement);
      setEditor({ ...editor, sections });
    } catch (caught) {
      if (caught instanceof InferenceCancelledError) return;
      setError(caught instanceof Error ? caught.message : "Unable to propose sections.");
    } finally {
      setBusy(false);
      setProposing(false);
    }
  };

  const save = async () => {
    if (!editor) return;
    setBusy(true);
    setError(null);
    try {
      await appContainer.knowledgeTemplateService.save(editor);
      setEditor(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save template.");
    } finally {
      setBusy(false);
    }
  };

  const trash = (template: Template) => {
    Alert.alert("Move template to Trash?", "Existing Knowledge results remain unchanged and readable.", [
      { text: "Cancel", style: "cancel" },
      { text: "Move to Trash", style: "destructive", onPress: () => {
        void appContainer.trashService.trashTemplate(template.getId()).then(async () => {
          showTrashUndo({
            message: `${template.getName()} moved to Trash`,
            undo: async () => {
              await appContainer.trashService.restore("template", template.getId());
              await load();
            },
          });
          await load();
        }, (caught: unknown) => Alert.alert("Unable to move template", caught instanceof Error ? caught.message : "Please try again."));
      }},
    ]);
  };

  const updateSection = (index: number, patch: Partial<KnowledgeTemplateSection>) => {
    if (!editor) return;
    setEditor({ ...editor, sections: editor.sections.map((section, position) => position === index ? { ...section, ...patch } : section) });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Knowledge Templates" }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, { paddingBottom: Spacing.xxl + insets.bottom }]}>
        {editor === null ? (
          <>
            <View style={styles.heading}>
              <View style={styles.headingCopy}>
                <Text style={[styles.title, { color: colors.text }]}>Custom templates</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>Built-in templates remain read-only. Custom templates define future Knowledge generations.</Text>
              </View>
              <AppButton label="＋ New" onPress={() => { setError(null); setEditor({ name: "", requirement: "", sections: [] }); }} />
            </View>
            {state.status === "loading" && <LoadingState />}
            {state.status === "error" && <ErrorState message={state.message} onRetry={() => void load()} />}
            {state.status === "success" && state.templates.length === 0 && <EmptyState title="No custom templates" description="Describe what you want to extract and local AI will propose the sections." />}
            {state.status === "success" && state.templates.map((template) => (
              <View key={template.getId()} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.headingCopy}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{template.getName()}</Text>
                  <Text numberOfLines={2} style={[styles.subtitle, { color: colors.textMuted }]}>{template.getRequirement()}</Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>{template.getSections().length} sections</Text>
                </View>
                <View style={styles.actions}>
                  <AppButton label="Edit" variant="secondary" onPress={() => { setError(null); setEditor({ id: template.getId(), name: template.getName(), requirement: template.getRequirement(), sections: [...template.getSections()] }); }} />
                  <AppButton label="Trash" variant="quiet" onPress={() => trash(template)} />
                </View>
              </View>
            ))}
          </>
        ) : (
          <>
            <View style={styles.heading}>
              <View style={styles.headingCopy}>
                <Text style={[styles.title, { color: colors.text }]}>{editor.id ? "Edit template" : "New template"}</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>Edits affect future generations only. Saved results keep their original structure.</Text>
              </View>
              <Pressable onPress={() => setEditor(null)}><Text style={[styles.close, { color: colors.textMuted }]}>Cancel</Text></Pressable>
            </View>
            <Field label="Name" value={editor.name} onChangeText={(name) => setEditor({ ...editor, name })} placeholder="e.g. Research Review" />
            <Field label="What should this template extract?" multiline value={editor.requirement} onChangeText={(requirement) => setEditor({ ...editor, requirement })} placeholder="Describe the information and organization you need…" />
            {editor.sections.length === 0 ? (
              <View style={styles.actions}>
                <AppButton label={proposing ? "Cancel Proposal" : error ? "Retry Proposal" : "Propose Sections"} onPress={() => proposing ? void appContainer.knowledgeTemplateService.cancelProposal() : void propose()} />
                <AppButton label="Build Manually" variant="secondary" disabled={busy} onPress={() => setEditor({ ...editor, sections: appContainer.knowledgeTemplateService.manualSections() })} />
              </View>
            ) : (
              <>
                <View style={styles.sectionHeading}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Review sections ({editor.sections.length}/8)</Text>
                  {editor.sections.length < 8 && <Pressable onPress={() => setEditor({ ...editor, sections: [...editor.sections, { key: `section_${editor.sections.length + 1}`, title: "", instruction: "" }] })}><Text style={[styles.close, { color: colors.accent }]}>＋ Add</Text></Pressable>}
                </View>
                {editor.sections.map((section, index) => (
                  <View key={`${section.key}-${index}`} style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.sectionHeading}>
                      <Text style={[styles.meta, { color: colors.textMuted }]}>Section {index + 1}</Text>
                      {editor.sections.length > 2 && <Pressable onPress={() => setEditor({ ...editor, sections: editor.sections.filter((_, position) => position !== index) })}><Text style={[styles.meta, { color: colors.danger }]}>Remove</Text></Pressable>}
                    </View>
                    <Field label="Title" value={section.title} onChangeText={(title) => updateSection(index, { title })} placeholder="Section title" />
                    <Field label="Extraction guidance" multiline value={section.instruction} onChangeText={(instruction) => updateSection(index, { instruction })} placeholder="What grounded information belongs here?" />
                  </View>
                ))}
                <View style={styles.actions}>
                  <AppButton label={busy ? "Saving…" : "Save Template"} disabled={busy} onPress={() => void save()} />
                  <AppButton label="Propose Again" variant="secondary" disabled={busy} onPress={() => void propose()} />
                  {proposing && <AppButton label="Cancel Proposal" variant="quiet" onPress={() => void appContainer.knowledgeTemplateService.cancelProposal()} />}
                </View>
              </>
            )}
            {error && <Text selectable style={[styles.error, { color: colors.danger }]}>{error}</Text>}
          </>
        )}
      </ScrollView>
    </View>
  );

  function Field({ label, value, onChangeText, placeholder, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean }) {
    return <View style={styles.field}><Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text><TextInput multiline={multiline} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textMuted} textAlignVertical={multiline ? "top" : "center"} style={[styles.input, multiline && styles.multiline, { borderColor: colors.border, color: colors.text }]} /></View>;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: Spacing.lg, padding: Spacing.lg },
  heading: { alignItems: "flex-start", flexDirection: "row", gap: Spacing.md, justifyContent: "space-between" },
  headingCopy: { flex: 1, gap: Spacing.xs },
  title: { fontSize: 28, fontWeight: "800" },
  subtitle: { fontSize: 14, lineHeight: 20 },
  close: { fontSize: 14, fontWeight: "800", paddingVertical: Spacing.sm },
  card: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.md, borderWidth: 1, boxShadow: Shadows.card, flexDirection: "row", gap: Spacing.md, padding: Spacing.md },
  cardTitle: { fontSize: 17, fontWeight: "800" },
  meta: { fontSize: 12, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  field: { gap: Spacing.xs },
  label: { fontSize: 13, fontWeight: "700" },
  input: { borderRadius: Radius.sm, borderWidth: 1, fontSize: 16, minHeight: 48, paddingHorizontal: Spacing.md },
  multiline: { minHeight: 96, paddingTop: Spacing.md },
  sectionHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  sectionCard: { borderRadius: Radius.md, borderWidth: 1, gap: Spacing.md, padding: Spacing.md },
  error: { fontSize: 13, lineHeight: 18 },
});
