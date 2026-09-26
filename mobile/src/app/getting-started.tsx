import { UiText as Text } from "@/components/ui-text";
import { type Href, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appContainer } from "@/application";
import { AppButton } from "@/components/app-button";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useAppPreferences } from "@/providers/app-preferences-provider";

type ModelStatus = { stt: string; llm: string; tts: string };

const STEPS = [
  {
    title: "Private & Local",
    body: "Recordings, transcripts, notes, and AI results stay on this iPhone. Local AI runs without sending your content to a cloud service.",
  },
  {
    title: "Record or Import",
    body: "Record a live conversation or choose an audio file. LetsVoice saves the original transcript before starting any optional AI organization.",
  },
  {
    title: "Set Up AI Models",
    body: "Speech recognition, language, and text-to-speech models are installed only when you choose Download. Nothing is downloaded from this guide.",
  },
  {
    title: "Ready to Start",
    body: "Start with a recording, then review its Structured Note, tasks, Knowledge results, and private Ask AI conversations.",
  },
] as const;

function modelLabel(name: string | null): string {
  return name?.trim() || "Not set up";
}

export default function GettingStartedScreen() {
  const { replay, step: initialStep } = useLocalSearchParams<{
    replay?: string;
    step?: string;
  }>();
  const isReplay = replay === "1";
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = Colors[useTheme().mode];
  const { completeOnboarding } = useAppPreferences();
  const [step, setStep] = useState(() => {
    const requestedStep = Number(initialStep);
    return Number.isInteger(requestedStep)
      ? Math.min(Math.max(requestedStep, 0), STEPS.length - 1)
      : 0;
  });
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);

  useEffect(() => {
    if (step !== 2) return;
    let active = true;
    setModelStatus(null);
    void Promise.all([
      appContainer.sttModelService.getActiveModel(),
      appContainer.llmModelService.getActiveModel(),
      appContainer.ttsModelService.getActiveModel(),
    ]).then(([stt, llm, tts]) => {
      if (!active) return;
      setModelStatus({
        stt: modelLabel(stt?.getName() ?? null),
        llm: modelLabel(llm?.getName() ?? null),
        tts: modelLabel(tts?.getName() ?? null),
      });
    }).catch(() => {
      if (active) setModelStatus({ stt: "Unable to check", llm: "Unable to check", tts: "Unable to check" });
    });
    return () => { active = false; };
  }, [step]);

  const finish = async () => {
    if (!isReplay) await completeOnboarding();
    if (isReplay && router.canGoBack()) router.back();
    else router.replace("/");
  };

  const openModelPage = (
    pathname: "/ai/stt-models" | "/ai/llm-models" | "/ai/tts-models",
  ) => {
    router.push({
      pathname,
      params: {
        fromGuide: "1",
        guideReplay: isReplay ? "1" : "0",
      },
    } as Href);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
        ]}
      >
        <View style={styles.progressRow}>
          {STEPS.map((_, index) => (
            <View key={index} style={[styles.progressDot, { backgroundColor: index <= step ? colors.accent : colors.border }]} />
          ))}
        </View>
        <View style={styles.hero}>
          <Text style={[styles.kicker, { color: colors.accent }]}>GETTING STARTED · {step + 1} OF {STEPS.length}</Text>
          <Text style={[styles.title, { color: colors.text }]}>{STEPS[step].title}</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>{STEPS[step].body}</Text>
        </View>

        {step === 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Your data stays yours</Text>
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>No account is required. Deleting the app removes its notes, settings, and downloaded models from this iPhone.</Text>
          </View>
        )}
        {step === 1 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Two capture paths</Text>
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>Live recording uses the microphone. Import accepts a supported audio file. Permission is requested only when you start recording.</Text>
          </View>
        )}
        {step === 2 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {modelStatus === null ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.accent} />
                <Text style={[styles.cardBody, { color: colors.textMuted }]}>Checking models on this iPhone…</Text>
              </View>
            ) : (
              <>
                <ModelRow label="Speech to Text" value={modelStatus.stt} colors={colors} />
                <ModelRow label="Language Model" value={modelStatus.llm} colors={colors} />
                <ModelRow label="Text to Speech" value={modelStatus.tts} colors={colors} />
              </>
            )}
            <AppButton label="Open Speech-to-Text Models" variant="secondary" onPress={() => openModelPage("/ai/stt-models")} />
            <AppButton label="Open Language Models" variant="secondary" onPress={() => openModelPage("/ai/llm-models")} />
            <AppButton label="Open Text-to-Speech Models" variant="secondary" onPress={() => openModelPage("/ai/tts-models")} />
          </View>
        )}
        {step === 3 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Nothing runs without your action</Text>
            <Text style={[styles.cardBody, { color: colors.textMuted }]}>Microphone and notification permissions are requested only when you use the related feature. You can reopen this guide from Settings.</Text>
          </View>
        )}

        <View style={styles.actions}>
          {step > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous step"
              onPress={() => setStep((current) => Math.max(0, current - 1))}
              style={({ pressed }) => [
                styles.backButton,
                { backgroundColor: colors.accentSoft, borderColor: colors.border },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView name="chevron.left" size={20} tintColor={colors.accent} weight="bold" />
            </Pressable>
          )}
          <AppButton
            label={step === STEPS.length - 1 ? (isReplay ? "Close Guide" : "Start Using LetsVoice") : "Continue"}
            onPress={() => step === STEPS.length - 1 ? void finish() : setStep((current) => Math.min(STEPS.length - 1, current + 1))}
          />
        </View>
        {step < STEPS.length - 1 && !isReplay && <AppButton label="Skip for now" variant="quiet" onPress={() => void finish()} />}
        {isReplay && <AppButton label="Close Guide" variant="quiet" onPress={() => void finish()} />}
      </ScrollView>
    </View>
  );
}

function ModelRow({ label, value, colors }: { label: string; value: string; colors: (typeof Colors)[keyof typeof Colors] }) {
  return (
    <View style={styles.modelRow}>
      <Text style={[styles.modelLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text numberOfLines={2} style={[styles.modelValue, { color: value === "Not set up" ? colors.danger : colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, gap: Spacing.xl, justifyContent: "center", paddingHorizontal: Spacing.lg },
  progressRow: { flexDirection: "row", gap: Spacing.sm },
  progressDot: { borderRadius: 3, flex: 1, height: 5 },
  hero: { gap: Spacing.sm },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  title: { fontSize: 36, fontWeight: "800", lineHeight: 42 },
  body: { fontSize: 17, lineHeight: 26 },
  card: { borderCurve: "continuous", borderRadius: Radius.lg, borderWidth: 1, gap: Spacing.md, padding: Spacing.lg },
  cardTitle: { fontSize: 20, fontWeight: "800" },
  cardBody: { fontSize: 15, lineHeight: 22 },
  loadingRow: { alignItems: "center", flexDirection: "row", gap: Spacing.md },
  modelRow: { gap: 2 },
  modelLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6 },
  modelValue: { fontSize: 15, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, justifyContent: "flex-end" },
  backButton: { alignItems: "center", borderCurve: "continuous", borderRadius: Radius.sm, borderWidth: 1, height: 46, justifyContent: "center", width: 46 },
  pressed: { opacity: 0.65 },
});
