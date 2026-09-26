const DOCUMENTS_MARKER = "/Documents/";

function normalizeFilePath(value: string): string {
  const withoutScheme = value.replace(/^file:\/\//, "");
  try {
    return decodeURI(withoutScheme);
  } catch {
    return withoutScheme;
  }
}

export function toDocumentRelativePath(value: string): string {
  const normalized = normalizeFilePath(value);
  const markerIndex = normalized.lastIndexOf(DOCUMENTS_MARKER);
  return markerIndex >= 0
    ? normalized.slice(markerIndex + DOCUMENTS_MARKER.length)
    : normalized;
}

export function resolveDocumentPath(storedPath: string, currentDocumentUri: string): string {
  const normalized = normalizeFilePath(storedPath);
  const markerIndex = normalized.lastIndexOf(DOCUMENTS_MARKER);
  const isRelative = !normalized.startsWith("/");
  if (markerIndex < 0 && !isRelative) return normalized;

  const relativePath = markerIndex >= 0
    ? normalized.slice(markerIndex + DOCUMENTS_MARKER.length)
    : normalized;
  const documentPath = normalizeFilePath(currentDocumentUri).replace(/\/+$/, "");
  return `${documentPath}/${relativePath.replace(/^\/+/, "")}`;
}
