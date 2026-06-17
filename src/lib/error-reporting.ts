// Lightweight error-reporting hook. Currently a no-op stub; centralized here
// so the rest of the app can call a single function and we can later plug in
// any reporting backend without touching call sites.

export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  // Intentional no-op in production. Surface to console during development
  // so issues are visible while debugging without leaking to a third party.
  if (typeof window !== "undefined" && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.error("[zamzam]", error, context);
  }
}
