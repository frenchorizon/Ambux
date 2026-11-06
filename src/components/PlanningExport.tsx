import { useState } from "react";
import { useData } from "../game/context";
import { downloadBytes } from "../game/lomaco";
import { downloadCsv } from "../game/csv";
import { usePlanningBanner } from "./exportBanner";
import { openPrintWindow } from "./RouteSheets";
import {
  EXPORT_COLUMNS_ERROR,
  EXPORT_EMPTY_NOTE,
  EXPORT_EXCEL_ERROR,
  EXPORT_PRINT_BLOCKED,
  EXPORT_PRINT_FAILED,
  EXPORT_RANGE_ERROR,
  PLANNING_COLUMNS,
  frenchDate,
  loadPlanningChoice,
  planningCsv,
  planningMatrix,
  planningPrintGroups,
  planningPrintHtml,
  planningXlsx,
  savePlanningChoice,
  type PlanningChoice,
  type PlanningColumn,
} from "../io/exporters/planning";
import { Button } from "./ui/button";

export function PlanningExport() {
  const data = useData();
  const banner = usePlanningBanner();
  const [choice, setChoice] = useState<PlanningChoice>(() => loadPlanningChoice(data.missionIso));
  const [busy, setBusy] = useState(false);
  const input = {
    crews: data.crews,
    transports: data.transports,
    patients: data.patientById,
    locations: data.locMap,
    schedules: data.schedules,
    missionIso: data.missionIso,
    from: choice.from,
    to: choice.to,
    columns: choice.columns,
  };
  const matrix = planningMatrix(input);
  const ready = matrix.rangeOk && choice.columns.length > 0;

  const update = (next: PlanningChoice) => {
    setChoice(next);
    savePlanningChoice(next);
  };

  const failPrint = (message: string) => {
    data.dispatch({ type: "TOAST", message, tone: "warn" });
  };

  const downloadCsvFile = () => {
    if (!ready) return;
    downloadCsv(`ambux-planning-${choice.from}.csv`, planningCsv(matrix, banner));
    data.dispatch({ type: "NOTE_EXPORT", message: "Planning CSV téléchargé." });
  };

  const print = () => {
    if (!ready) return;
    const grouped = planningPrintGroups(input);
    const period = choice.from === choice.to ? undefined : `${frenchDate(choice.from)} – ${frenchDate(choice.to)}`;
    openPrintWindow(
      planningPrintHtml({ banner, headers: grouped.headers, groups: grouped.groups, period }),
      () => failPrint(EXPORT_PRINT_BLOCKED),
      () => failPrint(EXPORT_PRINT_FAILED),
    );
  };

  return (
    <section className="mb-4 rounded-xl border border-line p-3">
      <h3 className="text-sm font-semibold">Planning du jour</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Impression, Excel ou CSV. Le fichier reste dans ce navigateur. Rien n'est envoyé à Lomaco. Le choix des colonnes
        et des dates est mémorisé ici.
      </p>
      <BannerLines society={banner.society} day={frenchDate(data.missionIso)} depot={banner.depot} />
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
      {!matrix.rangeOk && (
        <p role="alert" className="mt-2 text-xs text-alert">
          {EXPORT_RANGE_ERROR}
        </p>
      )}
      {matrix.rangeOk && choice.columns.length === 0 && (
        <p role="alert" className="mt-2 text-xs text-alert">
          {EXPORT_COLUMNS_ERROR}
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        {matrix.rangeOk
          ? matrix.rows.length === 0
            ? `0 course dans la période. ${EXPORT_EMPTY_NOTE}`
            : `${matrix.rows.length} course${matrix.rows.length > 1 ? "s" : ""} dans la période.`
          : "Période invalide."}
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={!ready} onClick={print}>
          Imprimer / PDF
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={!ready} onClick={downloadCsvFile}>
          Planning CSV
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !ready}
          onClick={() => {
            setBusy(true);
            void planningXlsx(matrix, data.missionIso, banner)
              .then((bytes) => {
                downloadBytes(
                  `ambux-planning-${choice.from}.xlsx`,
                  bytes,
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                );
                data.dispatch({ type: "NOTE_EXPORT", message: "Planning Excel téléchargé." });
              })
              .catch(() => data.dispatch({ type: "TOAST", message: EXPORT_EXCEL_ERROR, tone: "warn" }))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Excel…" : "Planning Excel"}
        </Button>
      </div>
    </section>
  );
}

export function BannerLines({ society, day, depot }: { society: string; day: string; depot: string }) {
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt className="font-semibold">Société</dt>
      <dd>{society}</dd>
      <dt className="font-semibold">Date</dt>
      <dd>{day}</dd>
      <dt className="font-semibold">Dépôt</dt>
      <dd>{depot}</dd>
    </dl>
  );
}

function toggleColumn(current: readonly PlanningColumn[], id: PlanningColumn): PlanningColumn[] {
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  return PLANNING_COLUMNS.map((column) => column.id).filter((item) => next.includes(item));
}
