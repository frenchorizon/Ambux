import { useState, useSyncExternalStore } from "react";
import { FeedbackButton } from "./feedback/FeedbackForm";
import { openImportGuide } from "./ImportGuide";
import type { ModalId, ViewId } from "../game/types";
import {
  clampAmplitude,
  loadWorkspace,
  qualifyAddress,
  subscribeWorkspace,
  type WorkspaceProfile,
} from "../game/workspace";
import { geocodeAddress } from "../lib/routing";
import { readPrivateMode, setPrivateMode, usePrivateMode } from "../lib/routingPrivacy";
import { cn } from "../lib/utils";
import { BetaNotice } from "./legal/Legal";
import { Logo } from "./Sidebar";
import { Button } from "./ui/button";

const input =
  "mt-1 h-12 w-full rounded-xl border border-line bg-card px-3 text-base text-ink outline-none focus:ring-2 focus:ring-teal/40";

export function ModeBanner({ onChange, ecran }: { onChange: () => void; ecran?: string }) {
  const profile = useSyncExternalStore(subscribeWorkspace, loadWorkspace, () => null);
  if (!profile) return null;
  const enterprise = profile.mode === "entreprise";
  const label = enterprise ? profile.companyName || "Entreprise" : "Exemple";
  return (
    <div className={cn("mode-banner", enterprise && "is-enterprise")}>
      <p className="min-w-0 truncate">
        <span className="sr-only">Mode </span>
        {label}
      </p>
      {enterprise ? <FeedbackButton ecran={ecran} /> : null}
      <button type="button" onClick={onChange}>
        Changer
      </button>
    </div>
  );
}

export function ModeChoice({
  canCancel,
  onCancel,
  onDemo,
  onCompany,
  embedded = false,
}: {
  canCancel: boolean;
  onCancel: () => void;
  onDemo: () => void;
  onCompany: () => void;
  embedded?: boolean;
}) {
  return (
    <div
      id={embedded ? "commencer" : undefined}
      className={
        embedded
          ? "scroll-mt-8 grid gap-6 text-ink"
          : "mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8 text-ink"
      }
    >
      {!embedded && <Logo />}
      <div>
        <h1 className="font-display text-4xl font-light text-navy">Commencer</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Bêta publique d'un logiciel de planning pour le transport sanitaire. Accès gratuit, avis en échange. Il
          s'intègre à Lomaco et aux autres, il ne les remplace pas. Les données restent dans ce navigateur.
        </p>
        <BetaNotice tone="inline" />
      </div>
      <div className="grid gap-3">
        <button type="button" className="mode-choice" onClick={onDemo}>
          <span className="block text-base font-semibold">Essayer avec des données fictives</span>
          <span className="mt-1 block text-sm font-normal text-muted">Journée type de Rouen, patients inventés.</span>
        </button>
        <button type="button" className="mode-choice" onClick={onCompany}>
          <span className="block text-base font-semibold">Mon entreprise</span>
          <span className="mt-1 block text-sm font-normal text-muted">Un espace vide, au dépôt de la société.</span>
        </button>
      </div>
      <p className="text-xs leading-relaxed text-muted">Le brouillon déjà enregistré reste dans ce navigateur.</p>
      {canCancel && (
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      )}
    </div>
  );
}

export function CompanyWizard({
  initial,
  onBack,
  onEnter,
}: {
  initial: WorkspaceProfile | null;
  onBack: () => void;
  onEnter: (profile: WorkspaceProfile, view: ViewId, modal?: ModalId) => void;
}) {
  const [step, setStep] = useState<"form" | "suite">("form");
  const [companyName, setCompanyName] = useState(initial?.companyName ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [region, setRegion] = useState(initial?.region ?? "");
  const [address, setAddress] = useState(initial?.depot?.label ?? "");
  const [lat, setLat] = useState(initial?.depot ? String(initial.depot.lat) : "");
  const [lng, setLng] = useState(initial?.depot ? String(initial.depot.lng) : "");
  const [hours, setHours] = useState(String((initial?.amplitudeMin ?? 11 * 60) / 60));
  const [located, setLocated] = useState(initial?.depot?.label ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<WorkspaceProfile | null>(null);
  const privateMode = usePrivateMode();

  const fail = (message: string): null => {
    setError(message);
    return null;
  };

  const locate = async () => {
    setError("");
    if (readPrivateMode()) {
      setError("Mode privé : saisissez la latitude et la longitude. Aucune adresse n'est envoyée.");
      return;
    }
    const place = city.trim();
    const area = region.trim();
    if (!address.trim()) {
      setError("Saisissez l'adresse du dépôt, ou les coordonnées.");
      return;
    }
    if (!place || !area) {
      setError("Indiquez la ville et la région avant de localiser.");
      return;
    }
    setBusy(true);
    const hit = await geocodeAddress(qualifyAddress(address.trim(), place, area), { rouengate: false });
    setBusy(false);
    if (!hit) {
      setError(
        readPrivateMode()
          ? "Mode privé : saisissez la latitude et la longitude. Aucune adresse n'est envoyée."
          : "Adresse introuvable. Saisissez la latitude et la longitude.",
      );
      return;
    }
    setLat(String(hit.lat));
    setLng(String(hit.lng));
    setLocated(hit.label);
  };

  const profileFromForm = (): WorkspaceProfile | null => {
    const name = companyName.trim();
    const place = city.trim();
    const area = region.trim();
    const latitude = parseCoord(lat);
    const longitude = parseCoord(lng);
    const amplitude = Number(hours.replace(",", "."));
    if (!name) return fail("Indiquez le nom de la société.");
    if (!place || !area) return fail("Indiquez la ville et la région utilisées pour le géocodage.");
    if (
      latitude == null ||
      longitude == null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return fail("Localisez le dépôt ou saisissez une latitude et une longitude.");
    }
    if (!Number.isFinite(amplitude)) return fail("Indiquez l'amplitude horaire.");
    setError("");
    return {
      schema: 1,
      mode: "entreprise",
      companyName: name,
      city: place,
      region: area,
      amplitudeMin: clampAmplitude(amplitude * 60),
      depot: { label: address.trim() || located || "Dépôt", lat: latitude, lng: longitude },
    };
  };

  if (step === "suite" && ready) {
    const open = (view: ViewId, modal?: ModalId) => onEnter(ready, view, modal);
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-4 py-8 text-ink">
        <BetaNotice tone="inline" />
        <h1 className="font-display text-3xl font-light text-navy">{ready.companyName}</h1>
        <p className="text-sm leading-relaxed text-muted">
          L'espace part vide. Importez la flotte, le personnel et les missions, ou ouvrez les écrans d'ajout.
        </p>
        <div className="grid gap-2">
          <Button
            onClick={() => {
              openImportGuide();
              open("reglages");
            }}
          >
            Assistant d'import
          </Button>
          <Button variant="secondary" onClick={() => open("crews")}>
            Équipages
          </Button>
          <Button variant="secondary" onClick={() => open("vehicles")}>
            Véhicules
          </Button>
          <Button variant="secondary" onClick={() => open("patients")}>
            Patients
          </Button>
          <Button variant="secondary" onClick={() => open("tomorrow")}>
            Demande de demain
          </Button>
          <Button variant="secondary" onClick={() => open("reglages", "import")}>
            Importer
          </Button>
        </div>
        <button
          type="button"
          className="h-11 text-left text-sm font-semibold text-brand"
          onClick={() => setStep("form")}
        >
          Retour
        </button>
      </div>
    );
  }

  return (
    <form
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-8 text-ink"
      onSubmit={(event) => {
        event.preventDefault();
        const next = profileFromForm();
        if (!next) return;
        setReady(next);
        setStep("suite");
      }}
    >
      <div>
        <h1 className="font-display text-3xl font-light text-navy">Mon entreprise</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Société, dépôt, ville de géocodage, amplitude. Ensuite, les écrans d'ajout.
        </p>
        <div className="mt-3">
          <BetaNotice tone="inline" />
        </div>
      </div>
      <label className="text-sm font-semibold">
        Nom de la société
        <input
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          autoComplete="organization"
          className={input}
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Ville par défaut
          <input value={city} onChange={(event) => setCity(event.target.value)} className={input} />
        </label>
        <label className="text-sm font-semibold">
          Région par défaut
          <input value={region} onChange={(event) => setRegion(event.target.value)} className={input} />
        </label>
      </div>
      <p className="text-xs leading-relaxed text-muted">Ajoutées aux adresses lors du géocodage.</p>
      <label className="flex min-h-11 items-start gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0"
          checked={privateMode}
          onChange={(event) => {
            if (!setPrivateMode(event.target.checked)) {
              setError("Ce navigateur a refusé d'enregistrer le mode privé.");
            }
          }}
        />
        <span>
          Pas d'envoi d'adresse
          <span className="mt-0.5 block text-xs font-normal text-muted">
            Les adresses restent dans ce navigateur. Saisissez les coordonnées à la main.
          </span>
        </span>
      </label>
      {privateMode && (
        <p role="status" className="rounded-xl bg-ice px-3 py-2 text-sm text-navy">
          Adresses non envoyées.
        </p>
      )}
      <label className="text-sm font-semibold">
        Adresse du dépôt
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          autoComplete="street-address"
          className={input}
        />
      </label>
      <Button type="button" variant="secondary" disabled={busy || privateMode} onClick={() => void locate()}>
        {busy ? "Localisation…" : "Localiser"}
      </Button>
      {located && <p className="text-xs text-muted">{located}</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-semibold">
          Latitude
          <input inputMode="decimal" value={lat} onChange={(event) => setLat(event.target.value)} className={input} />
        </label>
        <label className="text-sm font-semibold">
          Longitude
          <input inputMode="decimal" value={lng} onChange={(event) => setLng(event.target.value)} className={input} />
        </label>
      </div>
      <p className="text-xs leading-relaxed text-muted">Si la localisation échoue, saisissez les coordonnées.</p>
      <label className="text-sm font-semibold">
        Amplitude horaire
        <input
          type="number"
          min={8}
          max={14}
          step={0.5}
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          className={input}
        />
      </label>
      <p className="text-xs leading-relaxed text-muted">Heures de vacation, de 8 à 14.</p>
      {error && (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      )}
      <Button type="submit">Continuer</Button>
      <button type="button" className="h-11 text-left text-sm font-semibold text-brand" onClick={onBack}>
        Retour
      </button>
    </form>
  );
}

function parseCoord(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
