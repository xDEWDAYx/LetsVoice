function decodeJsonString(value: string): string {
  const safe = value.endsWith("\\") ? value.slice(0, -1) : value;
  try { return JSON.parse(`"${safe}"`) as string; }
  catch { return safe.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\"); }
}

function findValueStart(raw: string, key: string, marker: string, expectedObjectDepth?: number): number {
  const keyToken = `"${key}"`;
  let objectDepth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) { escaped = false; continue; }
    if (char === "\\" && quoted) { escaped = true; continue; }
    if (char === '"') {
      if (!quoted && (expectedObjectDepth === undefined || objectDepth === expectedObjectDepth) && raw.startsWith(keyToken, index)) {
        let valueIndex = index + keyToken.length;
        while (/\s/u.test(raw[valueIndex] ?? "")) valueIndex += 1;
        if (raw[valueIndex] !== ":") return -1;
        valueIndex += 1;
        while (/\s/u.test(raw[valueIndex] ?? "")) valueIndex += 1;
        return raw.startsWith(marker, valueIndex) ? valueIndex + marker.length : -1;
      }
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === "{") objectDepth += 1;
    else if (char === "}" && objectDepth > 0) objectDepth -= 1;
  }
  return -1;
}

function extractStreamingStringAtDepth(raw: string, key: string, expectedObjectDepth?: number): string {
  let index = findValueStart(raw, key, '"', expectedObjectDepth);
  if (index < 0) return "";
  let escaped = false;
  let encoded = "";
  for (; index < raw.length; index += 1) {
    const char = raw[index];
    if (!escaped && char === '"') break;
    encoded += char;
    if (escaped) escaped = false;
    else if (char === "\\") escaped = true;
  }
  return decodeJsonString(encoded).trim();
}

export function extractStreamingString(raw: string, key: string): string {
  return extractStreamingStringAtDepth(raw, key);
}

export function extractStreamingStringArray(raw: string, key: string): string[] {
  let index = findValueStart(raw, key, "[");
  if (index < 0) return [];
  const values: string[] = [];
  while (index < raw.length) {
    while (index < raw.length && raw[index] !== '"' && raw[index] !== "]") index += 1;
    if (raw[index] === "]" || index >= raw.length) break;
    index += 1;
    let encoded = "";
    let escaped = false;
    let closed = false;
    while (index < raw.length) {
      const char = raw[index++];
      if (!escaped && char === '"') { closed = true; break; }
      encoded += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
    }
    const decoded = decodeJsonString(encoded).trim();
    if (decoded) values.push(decoded);
    if (!closed) break;
  }
  return values;
}

export function extractStreamingObjectStringFields(raw: string, arrayKey: string, fieldKey: string): string[] {
  let index = findValueStart(raw, arrayKey, "[");
  if (index < 0) return [];
  const values: string[] = [];
  let objectStart = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) { escaped = false; continue; }
    if (char === "\\" && quoted) { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (char === "{" && depth++ === 0) objectStart = index;
    if (char === "}" && depth > 0 && --depth === 0 && objectStart >= 0) {
      const value = extractStreamingStringAtDepth(raw.slice(objectStart, index + 1), fieldKey, 1);
      if (value) values.push(value);
      objectStart = -1;
    }
    if (char === "]" && depth === 0) break;
  }
  if (objectStart >= 0) {
    const value = extractStreamingStringAtDepth(raw.slice(objectStart), fieldKey, 1);
    if (value) values.push(value);
  }
  return values;
}
