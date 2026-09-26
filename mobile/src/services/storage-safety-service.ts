import { Paths } from "expo-file-system";

import { ValidationError } from "@/errors/validation-error";
import { formatBytes } from "@/utils/format-bytes";

export const STORAGE_SAFETY_RESERVE_BYTES = 256 * 1024 * 1024;

/**
 * Refuse storage-heavy work before it starts. The reserve leaves iOS/Android
 * enough working room for database writes, temporary files, and the OS.
 */
export function ensureStorageAvailable(
  operationBytes: number,
  operationDescription: string,
): void {
  const availableBytes = Paths.availableDiskSpace;
  const requiredBytes = Math.max(0, Math.ceil(operationBytes)) +
    STORAGE_SAFETY_RESERVE_BYTES;

  if (!Number.isFinite(availableBytes) || availableBytes < 0) {
    throw new ValidationError(
      `Free storage could not be checked before ${operationDescription}.`,
    );
  }

  if (availableBytes < requiredBytes) {
    const shortfallBytes = requiredBytes - availableBytes;
    throw new ValidationError(
      `Not enough free storage to ${operationDescription}. ` +
        `Free at least ${formatBytes(shortfallBytes)} and try again.`,
    );
  }
}
