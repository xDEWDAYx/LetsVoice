import { useSyncExternalStore } from "react";

import { appContainer } from "@/application";

export function useSpeechPlayback() {
  const service = appContainer.speechPlaybackService;
  const state = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
  return { service, state };
}
