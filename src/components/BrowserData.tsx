import { useRef, useState } from "react";
import {
  backupWouldReplace,
  buildBackup,
  downloadBackup,
  persistImported,
  readBackup,
  type AmbuxBackup,
} from "../game/backup";
import { useData } from "../game/context";
import { eraseAmbuxBrowser } from "../game/workspace";
import { useStorageNotice } from "../lib/browserStore";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";

export function BrowserData() {
  const { capture, dispatch } = useData();
  const notice = useStorageNotice();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<AmbuxBackup | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);

  const apply = (backup: AmbuxBackup) => {
    const failure = persistImported(backup);
    if (failure) {
      setError(failure);
      setPending(null);
      return;
    }
    dispatch({ type: "APPLY_BACKUP", state: backup.state });
    setPending(null);
    setError("");
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (fileRef.current) fileRef.current.value = "";
    let text: string;
    try {
      text = await file.text();
    } catch {
      setError("Impossible de lire ce fichier.");
      return;
    }
    const read = readBackup(text);
    if (!read.ok) {
      setError(read.message);
      return;
    }
    if (backupWouldReplace(capture())) {
      setPending(read.backup);
      return;
    }
    apply(read.backup);
  };

  return (
    <section aria-labelledby="sauvegarde-titre">
      <h2 id="sauvegarde-titre" className="text-sm font-semibold">
        Ce navigateur
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Reprise automatique à l'ouverture. Le fichier .ambux.json emporte le planning, la société et les règles.
      </p>
      <div className="mt-2 flex flex-col items-start">
        <button
          type="button"
          className="h-11 text-sm font-semibold text-brand"
          onClick={() => downloadBackup(buildBackup(capture()))}
        >
          Exporter
        </button>
        <button
          type="button"
          className="h-11 text-sm font-semibold text-brand"
          onClick={() => fileRef.current?.click()}
        >
          Importer
        </button>
        <button
          type="button"
          className="h-auto min-h-11 py-2 text-left text-sm font-semibold text-alert"
          onClick={() => setEraseOpen(true)}
        >
          Effacer toutes mes données de ce navigateur
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".ambux.json,application/json,.json"
        className="sr-only"
        aria-label="Fichier de sauvegarde"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      {notice.level !== "ok" && (
        <p role="status" className="mt-2 text-sm text-alert">
          {notice.message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-alert">
          {error}
        </p>
      )}
      <Modal
        open={pending != null}
        onClose={() => setPending(null)}
        title="Remplacer le travail de ce navigateur ?"
        description="Le planning, les règles et la société déjà présents seront remplacés par le fichier."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              if (pending) apply(pending);
            }}
          >
            Remplacer
          </Button>
          <Button variant="secondary" onClick={() => setPending(null)}>
            Annuler
          </Button>
        </div>
      </Modal>
      <Modal
        open={eraseOpen}
        onClose={() => setEraseOpen(false)}
        title="Effacer toutes mes données de ce navigateur ?"
        description="Brouillons, société, règles et préférences Ambux seront supprimés. Le reste du navigateur n'est pas modifié."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            onClick={() => {
              eraseAmbuxBrowser();
              setEraseOpen(false);
              dispatch({ type: "RESET_BROWSER" });
            }}
          >
            Effacer
          </Button>
          <Button variant="secondary" onClick={() => setEraseOpen(false)}>
            Annuler
          </Button>
        </div>
      </Modal>
    </section>
  );
}
