/**
 * Inference context size for Ask AI.
 *
 * This is a project configuration value validated on real devices — it is NOT
 * derived from model parameter count (e.g. 360M vs 1B).
 *
 * Adjust after on-device testing with the active GGUF model.
 */
export const ASK_AI_CONFIGURED_N_CTX = 3072;

/** Tokens reserved for assistant generation (maps to completion n_predict). */
export const ASK_AI_GENERATION_RESERVE = 320;

/** Classifier output is a three-value JSON object, so a full answer budget is wasteful. */
export const ASK_AI_CLASSIFIER_TOKENS = 48;

/** Hard wall-clock deadline for one queued + running Ask AI turn. */
export const ASK_AI_GENERATION_DEADLINE_MS = 90_000;

/** Buffer for chat-template and special-token overhead. */
export const ASK_AI_SAFETY_MARGIN = 64;

export const ASK_AI_PROMPT_BUDGET =
  ASK_AI_CONFIGURED_N_CTX - ASK_AI_GENERATION_RESERVE - ASK_AI_SAFETY_MARGIN;

export const ASK_AI_N_GPU_LAYERS = 99;

export const ASK_AI_COMPLETION_TEMPERATURE = 0.3;

export const ASK_AI_COMPLETION_TOP_P = 0.9;

/** Prevent a native completion from leaving the mobile UI spinning forever. */
export const ASK_AI_COMPLETION_TIMEOUT_MS = 90_000;
