export const SUPPORTED_AUDIO_EXTENSIONS = [
  ".wav",
  ".mp3",
  ".m4a",
  ".aac",
  ".flac",
] as const;

export const SUPPORTED_AUDIO_MIME_TYPES = [
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mp4a-latm",
  "audio/mpeg",
  "audio/vnd.wave",
  "audio/wav",
  "audio/wave",
  "audio/x-aac",
  "audio/x-flac",
  "audio/x-m4a",
  "audio/x-mp3",
  "audio/x-wav",
] as const;

export const MAX_IMPORTED_AUDIO_BYTES = 2 * 1024 * 1024 * 1024;

export function validateImportedAudio(
  fileName: string,
  sizeBytes: number,
  mimeType?: string | null,
): string | null {
  const normalizedName = fileName.trim().toLowerCase();
  const supportedExtension = SUPPORTED_AUDIO_EXTENSIONS.some((extension) =>
    normalizedName.endsWith(extension),
  );
  const normalizedMimeType = mimeType
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  const supportedMimeType = SUPPORTED_AUDIO_MIME_TYPES.some(
    (supported) => supported === normalizedMimeType,
  );

  // Android content providers are allowed to expose a display name without its
  // extension. BlueStacks does this for imported M4A recordings, so validate
  // the provider's MIME type as well as the display name.
  if (!supportedExtension && !supportedMimeType) {
    return "Choose a WAV, MP3, M4A, AAC, or FLAC audio file.";
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "This audio file is empty or its size could not be read.";
  }
  if (sizeBytes > MAX_IMPORTED_AUDIO_BYTES) {
    return "Audio files must be no larger than 2 GB.";
  }

  return null;
}
