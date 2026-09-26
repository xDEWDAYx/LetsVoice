const TARGET_CHUNK_CHARACTERS = 240;
const MAX_CHUNK_CHARACTERS = 360;

export function splitSpeechText(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^。！？!?；;\n]+[。！？!?；;]?/gu) ?? [normalized];
  const chunks: string[] = [];
  let current = "";

  const append = (value: string) => {
    const candidate = current ? `${current} ${value}` : value;
    if (candidate.length <= TARGET_CHUNK_CHARACTERS || current.length === 0) {
      current = candidate;
      return;
    }
    chunks.push(current);
    current = value;
  };

  for (const sentence of sentences.map((value) => value.trim()).filter(Boolean)) {
    if (sentence.length <= MAX_CHUNK_CHARACTERS) {
      append(sentence);
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }
    let remainder = sentence;
    while (remainder.length > MAX_CHUNK_CHARACTERS) {
      const whitespaceBoundary = remainder.lastIndexOf(" ", MAX_CHUNK_CHARACTERS);
      const splitAt = whitespaceBoundary >= TARGET_CHUNK_CHARACTERS
        ? whitespaceBoundary
        : MAX_CHUNK_CHARACTERS;
      chunks.push(remainder.slice(0, splitAt).trim());
      remainder = remainder.slice(splitAt).trimStart();
    }
    if (remainder) chunks.push(remainder);
  }
  if (current) chunks.push(current);
  return chunks;
}
