import { useMemo, useState } from "react";
import { useData } from "../game/context";
import { downloadBytes, loadExportProfiles, routeSheets, saveExportProfile, sheetsToCsvFiles, zipTexts, LOMACO_EXPORT_PROFILE, EXPORT_CATALOG, type ExportField, type ExportProfile } from "../game/lomaco";
import { sheetsToXlsx } from "../game/lomacoFiles";
import { printSheets } from "./RouteSheets";
import { Button } from "./ui/button";

export function LomacoExportPanel() {
  const data = useData();
  const [profiles, setProfiles] = useState<ExportProfile[]>(() => loadExportProfiles());
  const [profileId, setProfileId] = useState(LOMACO_EXPORT_PROFILE.id);
  const [name, setName] = useState(LOMACO_EXPORT_PROFILE.name);
  const [columns, setColumns] = useState<ExportField[]>(LOMACO_EXPORT_PROFILE.columns);
  const [busy, setBusy] = useState(false);
  const sheets = useMemo(
    () => routeSheets({
      crews: data.crews,
      transports: data.transports,
      patients: data.patientById,
      locations: data.locMap,
      schedules: data.schedules,
      missionIso: data.missionIso,
      columns,
    }),
    [columns, data.crews, data.locMap, data.missionIso, data.patientById, data.schedules, data.transports],
  );

  const choose = (id: string) => {
    const profile = profiles.find((item) => item.id === id) ?? LOMACO_EXPORT_PROFILE;
    setProfileId(profile.id);
    setName(profile.name);
    setColumns(profile.columns);
  };

  return (
    <div className="mb-4 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-semibold">
          Profil d'export
          <select aria-label="Profil d'export" className="mt-1 block h-10 rounded-lg border border-line bg-white px-2 text-sm font-normal" value={profileId} onChange={(event) => choose(event.target.value)}>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
        </label>
        <input aria-label="Nom du profil d'export" value={name} onChange={(event) => setName(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-line px-2 text-sm" />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            const saved = saveExportProfile({
              id: profileId === LOMACO_EXPORT_PROFILE.id ? `export-${Date.now().toString(36)}` : profileId,
              name: name.trim() || "Profil",
              columns,
            });
            setProfiles(saved);
            setProfileId(saved[saved.length - 1]!.id);
          }}
        >
          Enregistrer
        </Button>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-3">
        {EXPORT_CATALOG.map((field) => (
          <li key={field.id}>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={columns.includes(field.id)}
                onChange={() => {
                  setColumns((current) => current.includes(field.id)
                    ? current.filter((item) => item !== field.id)
                    : EXPORT_CATALOG.map((item) => item.id).filter((item) => item === field.id || current.includes(item)));
                }}
              />
              {field.label}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">{sheets.map((sheet) => `${sheet.name} (${Math.max(0, sheet.rows.length - 1)})`).join(" · ")}</p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => printSheets(data)}>Imprimer / PDF</Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || columns.length === 0}
          onClick={() => {
            const files = sheetsToCsvFiles(sheets);
            downloadBytes(`ambux-feuilles-${data.missionIso}.zip`, zipTexts(files), "application/zip");
            data.dispatch({ type: "NOTE_EXPORT", message: "Feuilles CSV téléchargées, une par équipage." });
          }}
        >
          Feuilles CSV
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || columns.length === 0}
          onClick={() => {
            setBusy(true);
            void sheetsToXlsx(sheets)
              .then((bytes) => {
                downloadBytes(`ambux-feuilles-${data.missionIso}.xlsx`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                data.dispatch({ type: "NOTE_EXPORT", message: "Classeur Excel téléchargé, une feuille par équipage." });
              })
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Excel…" : "Feuilles XLSX"}
        </Button>
      </div>
    </div>
  );
}
