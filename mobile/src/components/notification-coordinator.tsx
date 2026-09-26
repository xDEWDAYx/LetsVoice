import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { appContainer } from "@/application";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function noteIdFromResponse(response: Notifications.NotificationResponse | null): string | null {
  const data = response?.notification.request.content.data;
  if (data?.kind !== "speakspace-note" || typeof data.noteId !== "string") return null;
  const noteId = data.noteId.trim();
  return /^[a-zA-Z0-9_-]{1,220}$/.test(noteId) ? noteId : null;
}

export function NotificationCoordinator() {
  const router = useRouter();
  const handledResponseId = useRef<string | null>(null);

  useEffect(() => {
    const openResponse = async (response: Notifications.NotificationResponse | null) => {
      if (!response || handledResponseId.current === response.notification.request.identifier) return;
      const noteId = noteIdFromResponse(response);
      if (!noteId) return;
      handledResponseId.current = response.notification.request.identifier;
      try {
        if (await appContainer.noteService.getNote(noteId)) {
          router.push({ pathname: "/notes/[noteId]", params: { noteId } });
        }
      } finally {
        try {
          Notifications.clearLastNotificationResponse();
        } catch (error) {
          console.warn("[Notifications] Unable to clear handled response.", { error });
        }
      }
    };

    void Notifications.getLastNotificationResponseAsync().then((response) => void openResponse(response));
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => void openResponse(response));
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void appContainer.noteNotificationService.reconcile().catch((error) => {
          console.warn("[Notifications] Reconciliation failed.", { error });
        });
      }
    });
    void appContainer.noteNotificationService.reconcile().catch((error) => {
      console.warn("[Notifications] Initial reconciliation failed.", { error });
    });
    return () => {
      responseSubscription.remove();
      appStateSubscription.remove();
    };
  }, [router]);

  return null;
}
