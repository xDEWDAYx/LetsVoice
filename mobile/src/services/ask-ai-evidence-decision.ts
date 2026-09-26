export type EvidenceStatus = "supported" | "missing" | "unsupported";

export type EvidenceDecisionGuard =
  | "relation-mismatch"
  | "direct-evidence-match"
  | "overview-context-present"
  | "yes-no-explicit-support"
  | "meta-missing"
  | "selected-evidence-present";

/**
 * Decide whether deterministic transcript selection may proceed to answering.
 *
 * A second model completion must never veto non-empty selected evidence. The
 * generated answer is grounded and validated after generation instead.
 */
export function resolveSelectedEvidenceStatus(
  guard: EvidenceDecisionGuard,
  selectedEvidenceCount: number,
): EvidenceStatus {
  if (selectedEvidenceCount === 0 || guard === "relation-mismatch") {
    return "unsupported";
  }

  if (guard === "meta-missing") {
    return "missing";
  }

  return "supported";
}

/**
 * Prefer the top verified evidence sentence for a same-language direct fact.
 * This avoids asking a small local model to reinterpret an answer that was
 * already matched deterministically.
 */
export function resolveDirectEvidenceAnswer(
  guard: EvidenceDecisionGuard,
  question: string,
  selectedEvidence: string[],
): string | null {
  if (guard !== "direct-evidence-match") {
    return null;
  }

  const answer = selectedEvidence
    .find((evidence) => evidence.trim().length > 0)
    ?.trim();
  if (answer === undefined) {
    return null;
  }

  const cjkPattern = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
  if (cjkPattern.test(question) !== cjkPattern.test(answer)) {
    return null;
  }

  return answer;
}
