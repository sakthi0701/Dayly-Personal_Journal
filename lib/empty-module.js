// Intentional empty stub. next.config.ts aliases optional provider SDKs that mem0ai
// (and other transitive deps) dynamically import but Dayly never uses, e.g.
// @aws-sdk/client-bedrock-runtime, to this file so Turbopack resolves them.
// Those providers are never instantiated, so the empty export is never read.
// WARNING: Do NOT delete this file or drop the resolveAlias entries. Removing it
// makes the Turbopack build fail with "Module not found" on every optional import.
export default {};
