import * as Notifications from "expo-notifications";

import { AppPreferencesService } from "@/services/app-preferences-service";
import type { CoreNoteInsightService } from "@/services/core-note-insight-service";
import type { NoteService } from "@/services/note-service";
import type { WorkspaceService } from "@/services/workspace-service";
import { planNoteNotifications } from "@/services/note-notification-planner";

export type NotificationEnableResult = "enabled" | "denied" | "unavailable";

function isAuthorized(permission: Notifications.NotificationPermissionsStatus): boolean {
  if (permission.granted) return true;
  const status = permission.ios?.status;
  return status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    status === Notifications.IosAuthorizationStatus.EPHEMERAL;
}

function isOwnedNotification(request: Notifications.NotificationRequest): boolean {
  return request.content.data?.kind === "speakspace-note";
}

export class NoteNotificationService {
  private reconcilePromise: Promise<void> | null = null;

  public constructor(
    private readonly coreNoteInsightService: CoreNoteInsightService,
    noteService: NoteService,
    private readonly preferences: AppPreferencesService,
    workspaceService: WorkspaceService,
  ) {
    const reconcile = () => {
      void this.reconcile().catch((error) => {
        console.warn("[Notifications] Change reconciliation failed.", { error });
      });
    };
    this.coreNoteInsightService.subscribeToChanges(reconcile);
    noteService.subscribeToChanges(reconcile);
    workspaceService.subscribeToChanges(reconcile);
  }

  public async setEnabled(enabled: boolean): Promise<NotificationEnableResult> {
    if (process.env.EXPO_OS !== "ios") return "unavailable";
    if (!enabled) {
      await this.preferences.setNotificationsEnabled(false);
      await this.cancelAllOwned();
      return "enabled";
    }

    let permission = await Notifications.getPermissionsAsync();
    if (!isAuthorized(permission)) permission = await Notifications.requestPermissionsAsync();
    if (!isAuthorized(permission)) {
      await this.preferences.setNotificationsEnabled(false);
      return "denied";
    }

    await this.preferences.setNotificationsEnabled(true);
    await this.reconcile();
    return "enabled";
  }

  public reconcile(): Promise<void> {
    if (this.reconcilePromise) return this.reconcilePromise;
    const promise = this.runReconcile().finally(() => {
      if (this.reconcilePromise === promise) this.reconcilePromise = null;
    });
    this.reconcilePromise = promise;
    return promise;
  }

  private async runReconcile(): Promise<void> {
    if (process.env.EXPO_OS !== "ios") return;
    if (!this.preferences.getSnapshot().notificationsEnabled) {
      await this.cancelAllOwned();
      return;
    }
    const permission = await Notifications.getPermissionsAsync();
    if (!isAuthorized(permission)) return;

    const [source, scheduled] = await Promise.all([
      this.coreNoteInsightService.getDashboardItems(),
      Notifications.getAllScheduledNotificationsAsync(),
    ]);
    for (const request of scheduled.filter(isOwnedNotification)) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }

    // Expo SDK 57 accepts an absolute local Date trigger for one-off notifications.
    for (const notification of planNoteNotifications(source)) {
      await Notifications.scheduleNotificationAsync({
        identifier: notification.identifier,
        content: {
          title: notification.title,
          body: notification.body,
          sound: "default",
          data: {
            kind: "speakspace-note",
            noteId: notification.noteId,
            itemId: notification.itemId,
            itemKind: notification.kind,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: notification.triggerAt,
        },
      });
    }
  }

  private async cancelAllOwned(): Promise<void> {
    if (process.env.EXPO_OS !== "ios") return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const request of scheduled.filter(isOwnedNotification)) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
  }
}
