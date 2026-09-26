import { NativeModule, requireNativeModule } from "expo";
import { Platform } from "react-native";

export type AudioInterruptionEvent = {
  type: "began" | "ended";
  shouldResume: boolean;
};

type AudioSessionEvents = {
  onInterruption: (event: AudioInterruptionEvent) => void;
};

class AudioSessionEventsModule extends NativeModule<AudioSessionEvents> {}

const nativeModule = Platform.OS === "ios"
  ? requireNativeModule<AudioSessionEventsModule>("AudioSessionEvents")
  : null;

export function addAudioInterruptionListener(
  listener: (event: AudioInterruptionEvent) => void,
): { remove: () => void } {
  return nativeModule?.addListener("onInterruption", listener) ?? {
    remove: () => undefined,
  };
}
