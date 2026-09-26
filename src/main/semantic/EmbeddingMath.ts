export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  a.forEach((value, index) => {
    dot += value * b[index];
    normA += value * value;
    normB += b[index] * b[index];
  });
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function rankBySimilarity<T extends { embedding: number[] }>(
  query: number[],
  items: T[],
  topK: number,
  threshold = 0.25,
): Array<T & { score: number }> {
  return items
    .map((item) => ({
      ...item,
      score: cosineSimilarity(query, item.embedding),
    }))
    .filter((item) => item.score >= threshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}
