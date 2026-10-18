import { useMemo, useState } from "react";
import { useData } from "../game/context";
import { tablesFromBuffer } from "../game/lomacoFiles";
import {
  IMPORT_FIELD_LABELS,
  LOMACO_IMPORT_PROFILE,
  applyProfile,
  loadImportProfiles,
  detectKind,
  mapSheet,
  normKey,
  previewLomaco,
  saveImportProfile,
  type ImportField,
  type ImportProfile,
  type LomacoPreview,
  type SheetKind,
  type SourceSheet,
} from "../game/lomaco";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

const KINDS: { id: SheetKind; label: string }[] = [
  { id: "transport", label: "Courses" },
  { id: "patient", label: "Patients" },
  { id: "personnel", label: "Personnel" },
  { id: "equipage", label: "Équipages" },
  { id: "vehicule", label: "Véhicules" },
  { id: "ignorer", label: "Ignorer" },
];

export function LomacoImportDialog({ open }: { open: boolean }) {
  const data = useData();
  const [step, setStep] = useState<"fichiers" | "colonnes" | "apercu">("fichiers");
  const [profiles, setProfiles] = useState<ImportProfile[]>(() => loadImportProfiles());
  const [profileId, setProfileId] = useState(LOMACO_IMPORT_PROFILE.id);
  const [profileName, setProfileName] = useState(LOMACO_IMPORT_PROFILE.name);
  const [sheets, setSheets] = useState<SourceSheet[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<LomacoPreview | null>(null);
  const profile = profiles.find((item) => item.id === profileId) ?? LOMACO_IMPORT_PROFILE;

  const close = () => {
    data.dispatch({ type: "CLOSE_MODAL" });
    setStep("fichiers");
    setPreview(null);
    setError(null);
  };

  const readFiles = async (list: FileList | File[]) => {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const next: SourceSheet[] = [];
      for (const file of list) {
        const tables = await tablesFromBuffer(await file.arrayBuffer(), file.name);
        for (const table of tables) next.push(mapSheet(table, profile));
      }
      if (!next.length) {
        setError("Aucune feuille lisible.");
        return;
      }
      setSheets((current) => [...current, ...next]);
    } catch {
      setError("Lecture impossible. Formats acceptés : xlsx, xls, csv.");
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await previewLomaco(sheets, {
        locations: data.locations,
        rules: data.rules,
        missionIso: data.missionIso,
        fleet: data.vehicles.map((vehicle) => ({ plate: vehicle.plate, vehicleType: vehicle.vehicleType })),
      });
      setPreview(result);
      setStep("apercu");
    } catch {
      setError("Prévisualisation impossible.");
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    if (!preview) return null;
    return {
      courses: preview.transports.reduce((sum, row) => sum + (row.retour ? 2 : 1), 0),
      vehicles: preview.vehicles.length,
      crews: preview.crews.length,
      rejected: preview.rejected.length,
    };
  }, [preview]);

  return (
    <Modal
      open={open}
      wide
      onClose={close}
      title="Importer"
      description="CSV ou Excel. Patients, courses, personnel et véhicules. Rien n'est écrit avant la fusion, qui s'annule d'un seul geste."
    >
      <ol className="mb-4 flex gap-2 text-xs font-semibold">
        {(["fichiers", "colonnes", "apercu"] as const).map((id, index) => (
          <li key={id} className={step === id ? "text-brand" : "text-muted"}>
            {index + 1}. {id === "fichiers" ? "Fichiers" : id === "colonnes" ? "Colonnes" : "Aperçu"}
          </li>
        ))}
      </ol>

      {step === "fichiers" && (
        <div className="space-y-3">
          <label className="block text-sm font-semibold">
            Fichiers Lomaco
            <input
              aria-label="Fichiers Lomaco"
              type="file"
              multiple
              accept=".xlsx,.xls,.csv,text/csv"
              className="mt-1 block w-full text-sm font-normal"
              onChange={(event) => {
                const list = event.target.files;
                if (list?.length) void readFiles(list);
                event.target.value = "";
              }}
            />
          </label>
          <p className="text-xs text-muted">
            Un ou plusieurs fichiers .csv, .xlsx ou .xls. Une feuille peut contenir des courses, des patients, du
            personnel ou des véhicules.
          </p>
          <ul className="max-h-40 space-y-1 overflow-auto text-sm">
            {sheets.map((sheet, index) => (
              <li
                key={`${sheet.file}-${sheet.sheet}-${index}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2"
              >
                <span className="min-w-0 truncate">
                  {sheet.file} · {sheet.sheet}
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-alert"
                  onClick={() => setSheets((current) => current.filter((_, item) => item !== index))}
                >
                  Retirer
                </button>
              </li>
            ))}
            {sheets.length === 0 && <li className="text-xs text-muted">Aucun fichier pour l'instant.</li>}
          </ul>
          <div className="flex justify-end">
            <Button type="button" disabled={!sheets.length || busy} onClick={() => setStep("colonnes")}>
              Colonnes
            </Button>
          </div>
        </div>
      )}

      {step === "colonnes" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-semibold">
              Profil d'import
              <select
                aria-label="Profil d'import"
                className="mt-1 block h-10 rounded-lg border border-line bg-card px-2 text-sm font-normal"
                value={profileId}
                onChange={(event) => {
                  const next = profiles.find((item) => item.id === event.target.value) ?? LOMACO_IMPORT_PROFILE;
                  setProfileId(next.id);
                  setProfileName(next.name);
                  setSheets((current) => current.map((sheet) => applyProfile({ ...sheet, kindLocked: false }, next)));
                }}
              >
                {profiles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              aria-label="Nom du profil"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-line px-2 text-sm"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const map: ImportProfile["map"] = {};
                for (const sheet of sheets) {
                  sheet.headers.forEach((header, index) => {
                    const key = normKey(header);
                    const field = sheet.fields[index];
                    if (key && field && field !== "ignore") map[key] = field;
                  });
                }
                const saved = saveImportProfile({
                  id: profileId === LOMACO_IMPORT_PROFILE.id ? `profil-${Date.now().toString(36)}` : profileId,
                  name: profileName.trim() || "Profil",
                  map,
                });
                setProfiles(saved);
                setProfileId(saved[saved.length - 1]!.id);
              }}
            >
              Enregistrer le profil
            </Button>
          </div>
          <div className="max-h-[45vh] space-y-3 overflow-auto">
            {sheets.map((sheet, sheetIndex) => (
              <section key={`${sheet.file}-${sheet.sheet}`} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {sheet.file} · {sheet.sheet}
                  </h3>
                  <label className="text-xs font-semibold">
                    Contenu
                    <select
                      aria-label={`Contenu ${sheet.sheet}`}
                      className="ml-2 h-9 rounded-lg border border-line bg-card px-2 text-sm font-normal"
                      value={sheet.kind}
                      onChange={(event) => {
                        const kind = event.target.value as SheetKind;
                        setSheets((current) =>
                          current.map((item, index) =>
                            index === sheetIndex ? { ...item, kind, kindLocked: true } : item,
                          ),
                        );
                      }}
                    >
                      {KINDS.map((kind) => (
                        <option key={kind.id} value={kind.id}>
                          {kind.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <ul className="mt-2 space-y-1">
                  {sheet.headers.map((header, column) => (
                    <li key={`${header}-${column}`} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
                      <span className="truncate" title={header || "Colonne vide"}>
                        {header || "Colonne vide"}
                      </span>
                      <select
                        aria-label={`Colonne ${header || column + 1}`}
                        className="h-9 max-w-[11rem] rounded-lg border border-line bg-card px-2 text-xs"
                        value={sheet.fields[column] ?? "ignore"}
                        onChange={(event) => {
                          const field = event.target.value as ImportField;
                          setSheets((current) =>
                            current.map((item, index) => {
                              if (index !== sheetIndex) return item;
                              const fields = item.fields.slice();
                              fields[column] = field;
                              return { ...item, fields, kind: item.kindLocked ? item.kind : detectKind(fields) };
                            }),
                          );
                        }}
                      >
                        {IMPORT_FIELD_LABELS.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep("fichiers")}>
              Retour
            </Button>
            <Button type="button" disabled={busy} onClick={() => void runPreview()}>
              {busy ? "Lecture…" : "Aperçu"}
            </Button>
          </div>
        </div>
      )}

      {step === "apercu" && preview && counts && (
        <div className="space-y-3">
          <p className="text-sm">
            {counts.courses} course{counts.courses > 1 ? "s" : ""} · {preview.patients.length} patient
            {preview.patients.length > 1 ? "s" : ""} · {preview.personnel.length} personne
            {preview.personnel.length > 1 ? "s" : ""} · {counts.vehicles} véhicule{counts.vehicles > 1 ? "s" : ""} ·{" "}
            {counts.crews} équipage{counts.crews > 1 ? "s" : ""} · {counts.rejected} rejet
            {counts.rejected > 1 ? "s" : ""} · {preview.warnings.length} avertissement
            {preview.warnings.length > 1 ? "s" : ""}
          </p>
          <div className="max-h-52 overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[28rem] text-left text-xs">
              <thead className="sticky top-0 bg-paper text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-2 py-2 font-semibold">Ligne</th>
                  <th className="px-2 py-2 font-semibold">Statut</th>
                  <th className="px-2 py-2 font-semibold">Détail</th>
                </tr>
              </thead>
              <tbody>
                {preview.transports.map((row) => (
                  <tr key={`t-${row.file}-${row.line}`} className="border-t border-line">
                    <td className="px-2 py-1.5">L{row.line}</td>
                    <td className="px-2 py-1.5">Acceptée</td>
                    <td className="px-2 py-1.5">{row.summary}</td>
                  </tr>
                ))}
                {preview.patients.map((row) => (
                  <tr key={`p-${row.file}-${row.line}`} className="border-t border-line">
                    <td className="px-2 py-1.5">L{row.line}</td>
                    <td className="px-2 py-1.5">Acceptée</td>
                    <td className="px-2 py-1.5">{row.summary}</td>
                  </tr>
                ))}
                {preview.personnel.map((row) => (
                  <tr key={`s-${row.file}-${row.line}`} className="border-t border-line">
                    <td className="px-2 py-1.5">L{row.line}</td>
                    <td className="px-2 py-1.5">Acceptée</td>
                    <td className="px-2 py-1.5">{row.summary}</td>
                  </tr>
                ))}
                {preview.vehicles.map((row) => (
                  <tr key={`v-${row.file}-${row.line}`} className="border-t border-line">
                    <td className="px-2 py-1.5">L{row.line}</td>
                    <td className="px-2 py-1.5">Acceptée</td>
                    <td className="px-2 py-1.5">{row.summary}</td>
                  </tr>
                ))}
                {preview.crews.map((row) => (
                  <tr key={`c-${row.file}-${row.line}`} className="border-t border-line">
                    <td className="px-2 py-1.5">L{row.line}</td>
                    <td className="px-2 py-1.5">Acceptée</td>
                    <td className="px-2 py-1.5">{row.summary}</td>
                  </tr>
                ))}
                {preview.warnings.map((row, index) => (
                  <tr key={`w-${index}`} className="border-t border-line bg-alert-soft">
                    <td className="px-2 py-1.5">L{row.line}</td>
                    <td className="px-2 py-1.5">Avertissement</td>
                    <td className="px-2 py-1.5">{row.message}</td>
                  </tr>
                ))}
                {preview.rejected.map((row, index) => (
                  <tr key={`r-${index}`} className="border-t border-line bg-alert-soft text-alert">
                    <td className="px-2 py-1.5">L{row.line}</td>
                    <td className="px-2 py-1.5">Rejet</td>
                    <td className="px-2 py-1.5">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep("colonnes")}>
              Retour
            </Button>
            <Button
              type="button"
              disabled={
                !counts.courses &&
                !counts.vehicles &&
                !counts.crews &&
                !preview.patients.length &&
                !preview.personnel.length
              }
              onClick={() => {
                data.dispatch({
                  type: "IMPORT_APPLY",
                  vehicles: preview.vehicles.map((row) => ({
                    plate: row.plate,
                    vehicleType: row.vehicleType,
                    name: row.name,
                    vehicleCode: row.vehicleCode,
                    active: row.active,
                    availability: row.availability,
                  })),
                  crews: preview.crews.map((row) => ({
                    plate: row.plate,
                    driver: row.driver,
                    mate: row.mate,
                    dea: row.dea,
                  })),
                  patients: preview.patients.map((row) => ({ patient: row.patient, location: row.location })),
                  personnel: preview.personnel.map((row) => ({
                    name: row.name,
                    role: row.role,
                    dea: row.dea,
                    availability: row.availability,
                  })),
                  courses: preview.transports.map((row) => ({
                    transport: row.transport,
                    patient: row.patient,
                    locations: row.locations,
                    retour: row.retour,
                  })),
                });
                data.dispatch({ type: "SET_VIEW", view: "gantt" });
                close();
              }}
            >
              Fusionner
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-alert">{error}</p>}
    </Modal>
  );
}
