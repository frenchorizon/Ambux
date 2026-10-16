import { useState } from "react";
import { downloadCsv, type CsvReject } from "../game/csv";
import {
  CREW_COLUMNS,
  CREW_TEMPLATE,
  VEHICLE_COLUMNS,
  VEHICLE_TEMPLATE,
  previewCrews,
  previewVehicles,
  type CrewCsvRow,
  type VehicleCsvRow,
} from "../game/fleetCsv";
import { useData } from "../game/context";
import { Button } from "./ui/button";

export function VehicleCsvImport() {
  const data = useData();
  const [text, setText] = useState("");
  const [accepted, setAccepted] = useState<VehicleCsvRow[] | null>(null);
  const [rejected, setRejected] = useState<CsvReject[]>([]);
  const run = (raw: string) => {
    const preview = previewVehicles(
      raw,
      data.vehicles.map((vehicle) => vehicle.plate),
    );
    setAccepted(preview.accepted);
    setRejected(preview.rejected);
  };
  return (
    <FleetBox
      title="Import CSV des véhicules"
      columns={VEHICLE_COLUMNS}
      templateName="ambux-vehicules.csv"
      template={VEHICLE_TEMPLATE}
      text={text}
      setText={setText}
      accepted={accepted}
      rejected={rejected}
      onPreview={() => run(text)}
      onFile={run}
      onMerge={() => {
        if (!accepted?.length) return;
        data.dispatch({
          type: "IMPORT_VEHICLES",
          rows: accepted.map((row) => ({ plate: row.plate, vehicleType: row.vehicleType, name: row.name })),
        });
        setAccepted(null);
        setRejected([]);
        setText("");
      }}
    />
  );
}

export function CrewCsvImport() {
  const data = useData();
  const [text, setText] = useState("");
  const [accepted, setAccepted] = useState<CrewCsvRow[] | null>(null);
  const [rejected, setRejected] = useState<CsvReject[]>([]);
  const run = (raw: string) => {
    const preview = previewCrews(
      raw,
      data.crews.map((crew) => ({ plate: crew.plate, vehicleType: crew.vehicleType })),
    );
    setAccepted(preview.accepted);
    setRejected(preview.rejected);
  };
  return (
    <FleetBox
      title="Import CSV des équipages"
      columns={CREW_COLUMNS}
      templateName="ambux-equipages.csv"
      template={CREW_TEMPLATE}
      text={text}
      setText={setText}
      accepted={accepted}
      rejected={rejected}
      onPreview={() => run(text)}
      onFile={run}
      onMerge={() => {
        if (!accepted?.length) return;
        data.dispatch({
          type: "IMPORT_CREWS",
          rows: accepted.map((row) => ({ plate: row.plate, driver: row.driver, mate: row.mate, dea: row.dea })),
        });
        setAccepted(null);
        setRejected([]);
        setText("");
      }}
    />
  );
}

function FleetBox({
  title,
  columns,
  templateName,
  template,
  text,
  setText,
  accepted,
  rejected,
  onPreview,
  onFile,
  onMerge,
}: {
  title: string;
  columns: string;
  templateName: string;
  template: string;
  text: string;
  setText: (value: string) => void;
  accepted: { line: number; summary: string }[] | null;
  rejected: CsvReject[];
  onPreview: () => void;
  onFile: (raw: string) => void;
  onMerge: () => void;
}) {
  return (
    <section className="mb-4 rounded-2xl border border-line bg-white p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 font-mono text-[11px] text-navy">{columns}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => downloadCsv(templateName, template)}>
          Télécharger le modèle
        </Button>
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
                onFile(raw);
              });
            }}
          />
        </label>
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        className="mt-2 w-full rounded-xl border border-line p-2 font-mono text-xs"
        placeholder={columns}
        aria-label={title}
      />
      <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={!text.trim()} onClick={onPreview}>
        Prévisualiser
      </Button>
      {accepted && (
        <div className="mt-3 space-y-2">
          <h4 className="text-sm font-semibold">
            {accepted.length} ligne{accepted.length > 1 ? "s" : ""} acceptée{accepted.length > 1 ? "s" : ""}
          </h4>
          <ul className="max-h-32 space-y-1 overflow-auto text-xs">
            {accepted.map((row) => (
              <li key={row.line} className="rounded-lg bg-paper px-2 py-1">
                L{row.line} · {row.summary}
              </li>
            ))}
            {accepted.length === 0 && <li className="text-muted">Aucune ligne retenue.</li>}
          </ul>
          <h4 className="text-sm font-semibold text-rose-800">
            {rejected.length} rejet{rejected.length > 1 ? "s" : ""}
          </h4>
          <ul className="max-h-32 space-y-1 overflow-auto text-xs">
            {rejected.map((row) => (
              <li key={`${row.line}-${row.reason}`} className="rounded-lg bg-rose-50 px-2 py-1 text-rose-900">
                L{row.line} · {row.reason}
              </li>
            ))}
            {rejected.length === 0 && <li className="text-muted">Aucun rejet.</li>}
          </ul>
          <Button type="button" size="sm" disabled={!accepted.length} onClick={onMerge}>
            Fusionner les lignes acceptées
          </Button>
        </div>
      )}
    </section>
  );
}
