// Shared "no misleading claims" guard for honesty tests. User-facing copy must
// never imply real AI recognition, exact/official/internet product matching, or
// real 3D / virtual try-on. Used by the uploadFlow and mockProductMatch honesty
// tests so the most prominent copy and the mock candidates share one guard.
export const FORBIDDEN_CLAIM_TERMS =
  /\bAI\b|artificial intelligence|neural|machine learning|exact|official|automatically recognized|\b(recogniz|recognis)\w*|internet (search|match)|\bproduct (search|recognition)\b|real[- ]?time|\b3d\b|try[- ]?on/i
