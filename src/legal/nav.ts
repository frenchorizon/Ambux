export type LegalPageId = "mentions" | "confidentialite";

export function legalPageFromHash(hash: string): LegalPageId | null {
  if (hash === "#mentions-legales") return "mentions";
  if (hash === "#confidentialite") return "confidentialite";
  return null;
}

export function closeLegalPage(): void {
  if (typeof window === "undefined") return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.history.pushState(null, "", next);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
