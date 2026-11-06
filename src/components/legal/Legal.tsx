import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { grantImportConsent, importRequiresConsent, revokeImportConsent, useImportConsent } from "../../legal/consent";
import {
  BETA_NOTICE,
  CONSENT_CHECKBOX,
  LEGAL_DRAFT_BODY,
  LEGAL_DRAFT_TITLE,
  MENTIONS,
  PRIVACY,
  PUBLISHER,
  type LegalSection,
} from "../../legal/copy";
import { closeLegalPage, legalPageFromHash, type LegalPageId } from "../../legal/nav";
import { loadWorkspace, subscribeWorkspace } from "../../game/workspace";
import { Logo } from "../Sidebar";
import { Button } from "../ui/button";

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

export function useLegalPage(): LegalPageId | null {
  return useSyncExternalStore(
    subscribeHash,
    () => legalPageFromHash(window.location.hash),
    () => null,
  );
}

export function BetaNotice({ tone = "strip" }: { tone?: "strip" | "inline" }) {
  const className =
    tone === "inline"
      ? "text-[13px] leading-relaxed text-muted"
      : "shrink-0 border-b border-line bg-paper px-3 py-2 text-[13px] leading-[18px] text-muted";
  return (
    <p role="note" className={className}>
      {BETA_NOTICE}
    </p>
  );
}

export function EnterpriseNotice() {
  const profile = useSyncExternalStore(subscribeWorkspace, loadWorkspace, () => null);
  if (profile?.mode !== "entreprise") return null;
  return <BetaNotice />;
}

export function LegalDocument({ id }: { id: LegalPageId }) {
  const title = id === "mentions" ? "Mentions légales" : "Politique de confidentialité";
  const sections = id === "mentions" ? MENTIONS : PRIVACY;
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLegalPage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-paper pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2">
          <Logo />
          <button
            type="button"
            className="ml-auto inline-flex h-11 items-center px-2 text-sm font-semibold text-brand"
            onClick={closeLegalPage}
          >
            Fermer
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p role="note" className="rounded-2xl border border-line bg-card px-3 py-3 text-sm leading-relaxed">
          <strong className="block font-semibold">{LEGAL_DRAFT_TITLE}</strong>
          <span className="mt-1 block">{LEGAL_DRAFT_BODY}</span>
        </p>
        <h1 ref={heading} tabIndex={-1} className="mt-5 font-display text-3xl font-light text-navy outline-none">
          {title}
        </h1>
        {id === "mentions" && <Publisher />}
        {sections.map((section) => (
          <Section key={section.title} section={section} />
        ))}
        <div className="mt-6">
          <BetaNotice tone="inline" />
        </div>
        <p className="mt-6">
          <a
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand"
            href={id === "mentions" ? "#confidentialite" : "#mentions-legales"}
          >
            {id === "mentions" ? "Politique de confidentialité" : "Mentions légales"}
          </a>
        </p>
      </main>
    </div>
  );
}

function Publisher() {
  return (
    <section className="mt-6" aria-labelledby="editeur-titre">
      <h2 id="editeur-titre" className="text-base font-semibold">
        Éditeur
      </h2>
      <dl className="mt-2 space-y-2">
        {PUBLISHER.map((row) => (
          <div key={row.term}>
            <dt className="text-[13px] font-semibold text-muted">{row.term}</dt>
            <dd className="text-sm">{row.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Section({ section }: { section: LegalSection }) {
  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold">{section.title}</h2>
      {section.paragraphs.map((paragraph) => (
        <p key={paragraph} className="mt-2 text-sm leading-relaxed">
          {paragraph}
        </p>
      ))}
    </section>
  );
}

export function ImportConsentSettings() {
  const consent = useImportConsent();
  return (
    <section aria-labelledby="informations-titre">
      <h2 id="informations-titre" className="text-sm font-semibold">
        Informations
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Texte juridique en brouillon, à faire relire. Les données restent dans ce navigateur.
      </p>
      <div className="mt-1 flex flex-col items-start">
        <a className="inline-flex min-h-11 items-center text-sm font-semibold text-brand" href="#mentions-legales">
          Mentions légales
        </a>
        <a className="inline-flex min-h-11 items-center text-sm font-semibold text-brand" href="#confidentialite">
          Politique de confidentialité
        </a>
      </div>
      {consent ? (
        <div className="mt-2">
          <p className="text-sm text-muted">
            Consentement d'import enregistré dans ce navigateur (version {consent.version}).
          </p>
          <button
            type="button"
            className="min-h-11 text-left text-sm font-semibold text-alert"
            onClick={() => revokeImportConsent()}
          >
            Révoquer le consentement d'import
          </button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Aucun consentement d'import enregistré dans ce navigateur.</p>
      )}
    </section>
  );
}

export function useImportBlocked(): boolean {
  const profile = useSyncExternalStore(subscribeWorkspace, loadWorkspace, () => null);
  const consent = useImportConsent();
  return importRequiresConsent(profile?.mode, consent);
}

export function ImportConsentPanel() {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!checked) return;
        setError("");
        if (!grantImportConsent()) {
          setError("Ce navigateur a refusé d'enregistrer le consentement. L'import reste bloqué.");
        }
      }}
    >
      <h3 className="text-sm font-semibold">Avant d'importer un fichier</h3>
      <p className="text-sm leading-relaxed">
        CSV, Excel ou export Lomaco. {BETA_NOTICE} Ambux n'héberge pas de données de santé. Les fichiers restent dans ce
        navigateur. Les adresses peuvent être envoyées au géocodage ou au routage si ces services sont utilisés.
      </p>
      <p className="text-xs leading-relaxed text-muted">{LEGAL_DRAFT_TITLE}</p>
      <p className="text-sm">
        <a className="font-semibold text-brand" href="#confidentialite">
          Lire la politique de confidentialité
        </a>
      </p>
      <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
        <input
          type="checkbox"
          className="mt-1 size-5 shrink-0"
          required
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        />
        <span>{CONSENT_CHECKBOX}</span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={!checked}>
          Confirmer et importer
        </Button>
      </div>
    </form>
  );
}
