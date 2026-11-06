import { useState } from "react";
import { useData } from "../game/context";
import { CSV_COLUMNS, csvSpec, previewCsv, type CsvReject, type CsvRow } from "../game/csv";
import { ImportConsentPanel, useImportBlocked } from "./legal/Legal";
import { Button } from "./ui/button";

export function CsvImport() {
  const data = useData();
  const blocked = useImportBlocked();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<CsvRow[] | null>(null);
  const [rejected, setRejected] = useState<CsvReject[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = async (raw: string) => {
    setBusy(true);
    setError(null);
    try {
      const preview = await previewCsv(raw, data.locations, data.rules, data.missionIso);
      setAccepted(preview.accepted);
      setRejected(preview.rejected);
      if (!preview.accepted.length && !preview.rejected.length) setError("Fichier vide.");
    } catch {
      setError("Lecture impossible.");
    } finally {
      setBusy(false);
    }
  };

  if (blocked) return <ImportConsentPanel />;

  return (
    <section className="glass mb-4 p-3">
      <h3 className="text-sm font-semibold">Import CSV</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">{csvSpec(data.missionIso)}</p>
      <p className="mt-1 font-mono text-[11px] text-navy">{CSV_COLUMNS}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-brand">
          Choisir un fichier
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="mt-1 block text-xs font-normal text-ink"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((raw) => {
                setText(raw);
                void run(raw);
              });
            }}
          />
        </label>
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        className="mt-2 w-full rounded-xl border border-line p-2 font-mono text-xs"
        placeholder={`${CSV_COLUMNS}\nDOS-1;BERNARD;Luc;2026-10-16;10:30;Rue Saint-Nicolas, Rouen;CHU Charles-Nicolle;fauteuil;aller;;;;test`}
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="mt-2"
        disabled={busy || !text.trim()}
        onClick={() => void run(text)}
      >
        {busy ? "Vérification…" : "Prévisualiser"}
      </Button>
      {error && <p className="mt-2 text-sm text-alert">{error}</p>}
      {accepted && (
        <div className="mt-3 space-y-3">
          <div>
            <h4 className="text-sm font-semibold">
              {accepted.length} ligne{accepted.length > 1 ? "s" : ""} acceptée{accepted.length > 1 ? "s" : ""}
            </h4>
            <ul className="mt-1 max-h-40 space-y-1 overflow-auto text-xs">
              {accepted.map((row) => (
                <li key={row.transport.id} className="rounded-lg bg-paper px-2 py-1">
                  L{row.line} · {row.summary}
                </li>
              ))}
              {accepted.length === 0 && <li className="text-muted">Aucune ligne retenue.</li>}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-alert">
              {rejected.length} rejet{rejected.length > 1 ? "s" : ""}
            </h4>
            <ul className="mt-1 max-h-40 space-y-1 overflow-auto text-xs">
              {rejected.map((row) => (
                <li key={`${row.line}-${row.reason}`} className="rounded-lg bg-rose-50 px-2 py-1 text-alert">
                  L{row.line} · {row.reason}
                </li>
              ))}
              {rejected.length === 0 && <li className="text-muted">Aucun rejet.</li>}
            </ul>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!accepted.length}
            onClick={() => {
              data.dispatch({
                type: "IMPORT_BATCH",
                rows: accepted.map((row) => ({
                  transport: row.transport,
                  patient: row.patient,
                  location: row.location,
                  retour: row.retour,
                })),
              });
              setAccepted(null);
              setRejected([]);
              setText("");
            }}
          >
            Fusionner les lignes acceptées
          </Button>
        </div>
      )}
    </section>
  );
}
