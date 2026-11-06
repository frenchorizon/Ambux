import { useRef, useState } from "react";
import { downloadCsv, previewCsv, type CsvReject, type CsvRow } from "../game/csv";
import { useData } from "../game/context";
import { previewCrews, previewVehicles, type CrewCsvRow, type VehicleCsvRow } from "../game/fleetCsv";
import { downloadBytes } from "../game/lomaco";
import {
  GUIDE_META,
  GUIDE_STEPS,
  parseDelimited,
  selectSheet,
  tableToPreviewCsv,
  templateCsv,
  templateXlsx,
  workbookSheets,
  type GuideStep,
} from "../io/templates/guide";
import { ImportConsentPanel, useImportBlocked } from "./legal/Legal";
import { Button } from "./ui/button";

const OPEN_EVENT = "ambux-open-import-guide";
const OPEN_FLAG = "ambux-open-import-guide";

export function openImportGuide(): void {
  try {
    sessionStorage.setItem(OPEN_FLAG, "1");
  } catch {
    /* la navigation suivante relit le drapeau si le stockage de session répond */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_EVENT));
}

export function importGuideRequested(): boolean {
  try {
    return sessionStorage.getItem(OPEN_FLAG) === "1";
  } catch {
    return false;
  }
}

export function clearImportGuideRequest(): void {
  try {
    sessionStorage.removeItem(OPEN_FLAG);
  } catch {
    /* le drapeau est déjà illisible */
  }
}

export function subscribeImportGuide(onOpen: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const open = () => {
    clearImportGuideRequest();
    onOpen();
  };
  window.addEventListener(OPEN_EVENT, open);
  return () => window.removeEventListener(OPEN_EVENT, open);
}

type Preview =
  | { step: "vehicules"; accepted: VehicleCsvRow[]; rejected: CsvReject[] }
  | { step: "equipages"; accepted: CrewCsvRow[]; rejected: CsvReject[] }
  | { step: "missions"; accepted: CsvRow[]; rejected: CsvReject[] };

export function ImportGuide({ onClose }: { onClose: () => void }) {
  const data = useData();
  const blocked = useImportBlocked();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const request = useRef(0);
  const step = GUIDE_STEPS[index] ?? "vehicules";
  const meta = GUIDE_META[step];
  const last = index === GUIDE_STEPS.length - 1;

  const downloadCsvModel = () => {
    downloadCsv(meta.csvName, templateCsv(step, data.missionIso));
  };

  const downloadXlsxModel = async () => {
    setBusy(true);
    setError("");
    try {
      const bytes = await templateXlsx(step, data.missionIso);
      downloadBytes(meta.xlsxName, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch {
      setError("Le modèle Excel n'a pas pu être préparé.");
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File) => {
    const ticket = request.current + 1;
    request.current = ticket;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const table = /\.csv$/i.test(file.name)
        ? parseDelimited(await file.text())
        : selectSheet(await workbookSheets(await file.arrayBuffer()), meta.columns);
      if (ticket !== request.current) return;
      if (!table) {
        setError("Fichier vide.");
        return;
      }
      const mapped = tableToPreviewCsv(table.headers, table.rows, meta.columns, step);
      if (ticket !== request.current) return;
      if ("reason" in mapped) {
        setError(mapped.reason);
        return;
      }
      const next = await previewStep(step, mapped.csv, data);
      if (ticket !== request.current) return;
      if (!next.accepted.length && !next.rejected.length) {
        setError("Fichier vide.");
        return;
      }
      setPreview(next);
    } catch {
      if (ticket === request.current) setError("Lecture impossible. Formats acceptés : csv, xlsx.");
    } finally {
      if (ticket === request.current) setBusy(false);
    }
  };

  const commit = () => {
    if (!preview?.accepted.length) return;
    if (preview.step === "vehicules") {
      data.dispatch({
        type: "IMPORT_VEHICLES",
        rows: preview.accepted.map((row) => ({ plate: row.plate, vehicleType: row.vehicleType, name: row.name })),
      });
    } else if (preview.step === "equipages") {
      data.dispatch({
        type: "IMPORT_CREWS",
        rows: preview.accepted.map((row) => ({
          plate: row.plate,
          driver: row.driver,
          mate: row.mate,
          dea: row.dea,
        })),
      });
    } else {
      data.dispatch({
        type: "IMPORT_BATCH",
        rows: preview.accepted.map((row) => ({
          transport: row.transport,
          patient: row.patient,
          location: row.location,
          retour: row.retour,
        })),
      });
    }
    advance();
  };

  const advance = () => {
    request.current += 1;
    setPreview(null);
    setError("");
    if (last) onClose();
    else setIndex((current) => current + 1);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-5">
        <div>
          <p className="text-sm font-semibold text-brand">Import guidé</p>
          <h1 id="guide-titre" className="text-lg font-semibold">
            {meta.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Étape {index + 1} sur {GUIDE_STEPS.length}
          </p>
        </div>
        <ol aria-label="Étapes de l'import" className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {GUIDE_STEPS.map((id, at) => (
            <li
              key={id}
              aria-current={at === index ? "step" : undefined}
              className={at === index ? "font-semibold" : "text-muted"}
            >
              {at + 1}. {GUIDE_META[id].title}
            </li>
          ))}
        </ol>
        <p className="text-sm leading-relaxed">{meta.lead}</p>
        <p className="font-mono text-[13px] leading-relaxed text-navy">{meta.columns}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={downloadCsvModel}>
            Télécharger le CSV
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void downloadXlsxModel()}>
            Télécharger l'Excel
          </Button>
        </div>
        {blocked ? (
          <ImportConsentPanel />
        ) : (
          <label className="text-sm font-semibold">
            {meta.fileLabel}
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-1 block w-full text-sm font-normal"
              aria-label={meta.fileLabel}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void readFile(file);
              }}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-alert">
            {error}
          </p>
        )}
        {preview && <PreviewLists accepted={preview.accepted} rejected={preview.rejected} />}
        {preview && preview.accepted.length > 0 && (
          <Button type="button" disabled={busy} onClick={commit}>
            {last ? "Enregistrer et terminer" : "Enregistrer et continuer"}
          </Button>
        )}
        <button type="button" className="min-h-11 text-left text-sm font-semibold text-brand" onClick={advance}>
          {last ? "Terminer sans cette étape" : "Passer cette étape"}
        </button>
        <button type="button" className="min-h-11 text-left text-sm font-semibold text-muted" onClick={onClose}>
          Fermer
        </button>
        <p className="text-[13px] leading-relaxed text-muted">
          Chaque enregistrement est immédiat. Fermer conserve les étapes déjà enregistrées. Rien n'est envoyé.
        </p>
      </div>
    </div>
  );
}

function PreviewLists({
  accepted,
  rejected,
}: {
  accepted: { line: number; summary: string }[];
  rejected: CsvReject[];
}) {
  return (
    <div className="space-y-3" aria-live="polite">
      <div>
        <h2 className="text-sm font-semibold">{countLabel(accepted.length, "ligne acceptée", "lignes acceptées")}</h2>
        <ul className="mt-1 max-h-40 space-y-1 overflow-auto text-sm">
          {accepted.map((row) => (
            <li key={`ok-${row.line}-${row.summary}`} className="rounded-lg bg-paper px-2 py-1">
              L{row.line} · {row.summary}
            </li>
          ))}
          {accepted.length === 0 && <li className="text-muted">Aucune ligne retenue.</li>}
        </ul>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-alert">{countLabel(rejected.length, "rejet", "rejets")}</h2>
        <ul className="mt-1 max-h-40 space-y-1 overflow-auto text-sm">
          {rejected.map((row) => (
            <li key={`ko-${row.line}-${row.reason}`} className="rounded-lg bg-rose-50 px-2 py-1 text-alert">
              L{row.line} · {row.reason}
            </li>
          ))}
          {rejected.length === 0 && <li className="text-muted">Aucun rejet.</li>}
        </ul>
      </div>
    </div>
  );
}

function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}

async function previewStep(
  step: GuideStep,
  csv: string,
  data: {
    vehicles: { plate: string }[];
    crews: { plate: string; vehicleType: "ambulance" | "vsl" }[];
    locations: Parameters<typeof previewCsv>[1];
    rules: Parameters<typeof previewCsv>[2];
    missionIso: string;
  },
): Promise<Preview> {
  if (step === "vehicules") {
    const result = previewVehicles(
      csv,
      data.vehicles.map((vehicle) => vehicle.plate),
    );
    return { step, accepted: result.accepted, rejected: result.rejected };
  }
  if (step === "equipages") {
    const result = previewCrews(
      csv,
      data.crews.map((crew) => ({ plate: crew.plate, vehicleType: crew.vehicleType })),
    );
    return { step, accepted: result.accepted, rejected: result.rejected };
  }
  const result = await previewCsv(csv, data.locations, data.rules, data.missionIso);
  return { step: "missions", accepted: result.accepted, rejected: result.rejected };
}
