import { useState } from "react";
import { useData } from "../game/context";
import { downloadBytes } from "../game/lomaco";
import { downloadCsv } from "../game/csv";
import {
  PLANNING_COLUMNS,
  loadPlanningChoice,
  planningCsv,
  planningMatrix,
  planningXlsx,
  savePlanningChoice,
  type PlanningChoice,
  type PlanningColumn,
} from "../io/exporters/planning";
import { Button } from "./ui/button";

export function PlanningExport() {
  const data = useData();
  const [choice, setChoice] = useState<PlanningChoice>(() => loadPlanningChoice(data.missionIso));
  const [busy, setBusy] = useState(false);
  const matrix = planningMatrix({
    crews: data.crews,
    transports: data.transports,
    patients: data.patientById,
    locations: data.locMap,
    schedules: data.schedules,
    missionIso: data.missionIso,
    from: choice.from,
    to: choice.to,
    columns: choice.columns,
  });

  const update = (next: PlanningChoice) => {
    setChoice(next);
    savePlanningChoice(next);
  };

  const downloadCsvFile = () => {
    downloadCsv(`ambux-planning-${choice.from}.csv`, planningCsv(matrix));
    data.dispatch({ type: "NOTE_EXPORT", message: "Planning CSV téléchargé." });
  };

  return (
    <section className="mb-4 rounded-xl border border-line p-3">
      <h3 className="text-sm font-semibold">Planning</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Par défaut, le lendemain préparé. Le choix des colonnes et des dates est mémorisé dans ce navigateur.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="text-xs font-semibold">
          Du
          <input
            type="date"
            aria-label="Du"
            value={choice.from}
            onChange={(event) => update({ ...choice, from: event.target.value || data.missionIso })}
            className="mt-1 block h-10 rounded-lg border border-line px-2 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-semibold">
          Au
          <input
            type="date"
            aria-label="Au"
            value={choice.to}
            onChange={(event) => update({ ...choice, to: event.target.value || data.missionIso })}
            className="mt-1 block h-10 rounded-lg border border-line px-2 text-sm font-normal"
          />
        </label>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-1">
        {PLANNING_COLUMNS.map((column) => (
          <li key={column.id}>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={choice.columns.includes(column.id)}
                onChange={() => {
                  const columns = toggleColumn(choice.columns, column.id);
                  update({ ...choice, columns });
                }}
              />
              {column.label}
            </label>
          </li>
        ))}
      </ul>
      {!matrix.rangeOk && <p className="mt-2 text-xs text-alert">La date de début est après la date de fin.</p>}
      <p className="mt-2 text-xs text-muted">
        {matrix.rangeOk
          ? `${matrix.rows.length} course${matrix.rows.length > 1 ? "s" : ""} dans la période.`
          : "Période invalide."}
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!matrix.rangeOk || choice.columns.length === 0}
          onClick={downloadCsvFile}
        >
          Planning CSV
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !matrix.rangeOk || choice.columns.length === 0}
          onClick={() => {
            setBusy(true);
            void planningXlsx(matrix, data.missionIso)
              .then((bytes) => {
                downloadBytes(
                  `ambux-planning-${choice.from}.xlsx`,
                  bytes,
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                );
                data.dispatch({ type: "NOTE_EXPORT", message: "Planning Excel téléchargé." });
              })
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Excel…" : "Planning Excel"}
        </Button>
      </div>
    </section>
  );
}

function toggleColumn(current: readonly PlanningColumn[], id: PlanningColumn): PlanningColumn[] {
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  return PLANNING_COLUMNS.map((column) => column.id).filter((item) => next.includes(item));
}
