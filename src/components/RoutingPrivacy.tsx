import { useLayoutEffect, useState } from "react";
import {
  revokeRoutingNotice,
  setPrivateMode,
  setRoutingNoticeHost,
  settleRoutingNotice,
  usePrivateMode,
  useRoutingNotice,
  useRoutingNoticeOpen,
} from "../lib/routingPrivacy";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

export function RoutingNoticeHost() {
  const open = useRoutingNoticeOpen();
  useLayoutEffect(() => {
    setRoutingNoticeHost(true);
    return () => setRoutingNoticeHost(false);
  }, []);
  if (!open) return null;
  return <RoutingNoticeDialog />;
}

function RoutingNoticeDialog() {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      open
      onClose={() => settleRoutingNotice("dismiss")}
      title="Envoi des adresses"
      description="Les adresses partent vers des services publics tiers."
    >
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          Le géocodage envoie le texte de l'adresse à Photon (photon.komoot.io). Le routage envoie des coordonnées à
          OSRM (router.project-osrm.org). En secours : routing.openstreetmap.de, ou OpenRouteService si une clé est
          enregistrée dans ce navigateur.
        </p>
        <p>
          <a className="font-semibold text-brand" href="#confidentialite">
            Lire la politique de confidentialité
          </a>
        </p>
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-5 shrink-0"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>J'ai compris : les adresses sont envoyées à ces services publics.</span>
        </label>
        {error && (
          <p role="alert" className="text-alert">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (!setPrivateMode(true)) {
                setError("Ce navigateur a refusé d'enregistrer le mode privé.");
                return;
              }
              settleRoutingNotice("private");
            }}
          >
            Pas d'envoi d'adresse
          </Button>
          <Button type="button" disabled={!checked} onClick={() => settleRoutingNotice("send")}>
            Continuer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function RoutingSettings() {
  const privateMode = usePrivateMode();
  const notice = useRoutingNotice();
  const [error, setError] = useState("");
  return (
    <section aria-labelledby="routage-titre">
      <h2 id="routage-titre" className="text-sm font-semibold">
        Routage
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Sans le mode privé, un avertissement est demandé avant le premier envoi d'adresse.
      </p>
      <label className="mt-2 flex min-h-11 items-start gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0"
          checked={privateMode}
          onChange={(event) => {
            setError("");
            if (!setPrivateMode(event.target.checked)) {
              setError("Ce navigateur a refusé d'enregistrer le choix.");
            }
          }}
        />
        <span>
          Pas d'envoi d'adresse
          <span className="mt-0.5 block text-xs font-normal text-muted">
            Coupe Photon et OSRM. Latitude et longitude à la main. Kilomètres estimés dans ce navigateur.
          </span>
        </span>
      </label>
      {privateMode && (
        <p role="status" className="mt-2 rounded-xl bg-ice px-3 py-2 text-sm text-navy">
          Adresses non envoyées.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-alert">
          {error}
        </p>
      )}
      {notice ? (
        <div className="mt-2">
          <p className="text-sm text-muted">
            Avertissement d'envoi enregistré dans ce navigateur (version {notice.version}).
          </p>
          <button
            type="button"
            className="min-h-11 text-left text-sm font-semibold text-alert"
            onClick={() => revokeRoutingNotice()}
          >
            Révoquer l'avertissement d'envoi
          </button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Aucun avertissement d'envoi enregistré dans ce navigateur.</p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Photon : photon.komoot.io. Routage : router.project-osrm.org, secours routing.openstreetmap.de. Clé facultative
        OpenRouteService dans ambux.ors, utilisée seulement si le mode privé est éteint. ambux.routing = estimate force
        les kilomètres estimés sans couper le géocodage. Tuiles OpenStreetMap, ou un modèle https dans ambux.tiles (
        {"{z}"}, {"{x}"}, {"{y}"}). L'attribution OpenStreetMap reste affichée.
      </p>
    </section>
  );
}
