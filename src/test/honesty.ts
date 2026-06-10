// Shared "no misleading claims" guard for honesty tests. User-facing copy must
// never imply real AI recognition, exact/official/internet product matching, or
// real 3D / virtual try-on. Used by the uploadFlow and mockProductMatch honesty
// tests so the most prominent copy and the mock candidates share one guard.
export const FORBIDDEN_CLAIM_TERMS =
  /\bAI\b|artificial intelligence|neural|machine learning|exact|official|automatically recognized|\b(recogniz|recognis)\w*|internet (search|match)|\bproduct (search|recognition)\b|real[- ]?time|\b3d\b|try[- ]?on/i

// Track B (Proxy 3D Lab) variant. The literal token "3D" is allowed there —
// the proxy artifact genuinely is a 3D mesh ("proxy 3D preview",
// "image-to-3D proxy" are the sanctioned wordings) — but capability claims
// stay banned: no try-on, no accuracy/fit/size claims, no simulation, no AI,
// no reconstruction.
export const PROXY3D_FORBIDDEN_CLAIM_TERMS =
  /\bAI\b|artificial intelligence|neural|machine learning|try[- ]?on|accurate|body[- ]?accurate|simulation|true[- ]to[- ]size|\bfit(ting|ted)?\b|exact|official|perfect|automatic|real[- ]?time|\b(recogniz|recognis)\w*|reconstruct/i
