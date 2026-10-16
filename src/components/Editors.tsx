import { useMemo, useState } from "react";
import { useData } from "../game/context";
import { DAY_END, DAY_START, type Posture, type Transport, type VehicleType } from "../game/types";
import { formatKm, formatMin, kindLabel, personName, postureLabel, vehicleLabel } from "../lib/format";
import { geocodeAddress } from "../lib/routing";
import { CsvImport } from "./CsvImport";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function CrewsView() {
  const data = useData();
  const [name, setName] = useState("");
  const [role, setRole] = useState<"conducteur" | "auxiliaire">("auxiliaire");
  const [dea, setDea] = useState(true);
  return (
    <div className="h-full overflow-auto p-4">
      <PageTitle title="Équipages" text="Ambulance : deux personnes, dont un DEA. VSL : un conducteur. L'affectation se fait ici." />
      <form
        className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          data.dispatch({
            type: "UPSERT_STAFF",
            staff: { id: `st-${Date.now()}`, name: name.trim(), role, dea: role === "auxiliaire" ? dea : false },
          });
          setName("");
        }}
      >
        <label className="text-xs font-semibold">
          Nouveau personnel
          <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block h-9 rounded-lg border border-line px-2 text-sm font-normal" placeholder="Nom Prénom" />
        </label>
        <select value={role} onChange={(event) => setRole(event.target.value as "conducteur" | "auxiliaire")} className="h-9 rounded-lg border border-line px-2 text-sm">
          <option value="conducteur">Conducteur</option>
          <option value="auxiliaire">Auxiliaire</option>
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={dea} onChange={(event) => setDea(event.target.checked)} /> DEA
        </label>
        <Button type="submit" size="sm">Ajouter</Button>
      </form>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.crews.map((crew) => {
          const schedule = data.schedules.get(crew.id);
          const empty = (schedule?.legs ?? []).reduce((sum, leg) => sum + leg.deadheadKm, 0) + (schedule?.returnKm ?? 0);
          const drivers = data.staff.filter((member) => member.role === "conducteur");
          const mates = data.staff.filter((member) => member.role === "auxiliaire" || member.dea);
          return (
            <article key={crew.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
              <button type="button" className="text-left" onClick={() => data.dispatch({ type: "SET_CREW_FILTER", crewId: crew.id })}>
                <div className="font-semibold">{crew.code}</div>
                <div className="text-xs text-muted">{vehicleLabel(crew.vehicleType)} · {crew.plate}</div>
              </button>
              <label className="mt-3 block text-xs font-semibold">
                Conducteur
                <select
                  className="mt-1 block h-9 w-full rounded-lg border border-line px-2 text-sm font-normal"
                  value={crew.driverId ?? ""}
                  onChange={(event) =>
                    data.dispatch({ type: "SET_CREW_STAFF", crewId: crew.id, driverId: event.target.value, mateId: crew.mateId })
                  }
                >
                  {drivers.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </label>
              {crew.vehicleType === "ambulance" && (
                <label className="mt-2 block text-xs font-semibold">
                  DEA / auxiliaire
                  <select
                    className="mt-1 block h-9 w-full rounded-lg border border-line px-2 text-sm font-normal"
                    value={crew.mateId ?? ""}
                    onChange={(event) =>
                      data.dispatch({
                        type: "SET_CREW_STAFF",
                        crewId: crew.id,
                        driverId: crew.driverId ?? drivers[0]?.id ?? "",
                        mateId: event.target.value,
                      })
                    }
                  >
                    {mates.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}{member.dea ? " · DEA" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="mt-2 text-sm font-medium">{schedule?.legs.length ?? 0} courses · {formatKm(empty)} à vide</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function VehiclesView() {
  const data = useData();
  const [plate, setPlate] = useState("");
  const [kind, setKind] = useState<VehicleType>("ambulance");
  const [name, setName] = useState("");
  return (
    <div className="h-full overflow-auto p-4">
      <PageTitle title="Véhicules" text="Ajoutez une ambulance ou un VSL : il entre en ligne avec un équipage." />
      <form
        className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          data.dispatch({ type: "ADD_VEHICLE", plate, vehicleType: kind, name });
          setPlate("");
          setName("");
        }}
      >
        <label className="text-xs font-semibold">
          Immatriculation
          <input value={plate} onChange={(event) => setPlate(event.target.value)} className="mt-1 block h-9 rounded-lg border border-line px-2 text-sm font-normal uppercase" placeholder="GR-000-XX" />
        </label>
        <label className="text-xs font-semibold">
          Type
          <select value={kind} onChange={(event) => setKind(event.target.value as VehicleType)} className="mt-1 block h-9 rounded-lg border border-line px-2 text-sm font-normal">
            <option value="ambulance">Ambulance</option>
            <option value="vsl">VSL</option>
          </select>
        </label>
        <label className="text-xs font-semibold">
          Nom
          <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block h-9 rounded-lg border border-line px-2 text-sm font-normal" placeholder="Renault Master" />
        </label>
        <Button type="submit" size="sm">Ajouter</Button>
      </form>
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">Immatriculation</th>
              <th>Type</th>
              <th>Nom</th>
              <th>Équipage</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.vehicles.map((vehicle) => {
              const crew = data.crews.find((item) => item.vehicleId === vehicle.id);
              return (
                <tr key={vehicle.id} className="border-t border-line">
                  <td className="px-3 py-2">
                    <input
                      defaultValue={vehicle.plate}
                      className="h-8 w-28 rounded border border-line px-2 uppercase"
                      onBlur={(event) => data.dispatch({ type: "UPDATE_VEHICLE", vehicle: { ...vehicle, plate: event.target.value.toUpperCase() } })}
                    />
                  </td>
                  <td>
                    <select
                      value={vehicle.vehicleType}
                      className="h-8 rounded border border-line px-1"
                      onChange={(event) =>
                        data.dispatch({
                          type: "UPDATE_VEHICLE",
                          vehicle: { ...vehicle, vehicleType: event.target.value as VehicleType },
                        })
                      }
                    >
                      <option value="ambulance">Ambulance</option>
                      <option value="vsl">VSL</option>
                    </select>
                  </td>
                  <td>{vehicle.name}</td>
                  <td>{crew?.code ?? "—"}</td>
                  <td className="pr-3 text-right">
                    <button type="button" className="text-xs font-semibold text-rose-700" onClick={() => data.dispatch({ type: "REMOVE_VEHICLE", id: vehicle.id })}>
                      Retirer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PatientsView() {
  const data = useData();
  const [query, setQuery] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.patients.filter((patient) => !needle || `${patient.lastName} ${patient.firstName}`.toLowerCase().includes(needle));
  }, [data.patients, query]);
  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <PageTitle title="Patients" text="Nom, adresse, mobilité et notes. La mobilité se reporte sur les transports du patient." />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom du patient" className="mb-3 h-10 max-w-sm rounded-lg border border-line bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-brand/30" />
      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-line bg-white">
        {rows.map((patient) => {
          const home = data.locMap.get(patient.addressId);
          const open = editId === patient.id;
          return (
            <article key={patient.id} className="border-b border-line px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{personName(patient)}</h3>
                <button type="button" className="text-xs font-semibold text-brand" onClick={() => setEditId(open ? null : patient.id)}>
                  {open ? "Fermer" : "Modifier"}
                </button>
              </div>
              <p className="text-xs text-muted">{home ? `${home.name}, ${home.city}` : "Adresse"} · {postureLabel(patient.mobility ?? "assis")}{patient.note ? ` · ${patient.note}` : ""}</p>
              {open && (
                <PatientForm
                  patientId={patient.id}
                  onDone={() => setEditId(null)}
                />
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PatientForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const data = useData();
  const patient = data.patients.find((item) => item.id === patientId);
  const home = patient ? data.locMap.get(patient.addressId) : undefined;
  const [firstName, setFirstName] = useState(patient?.firstName ?? "");
  const [lastName, setLastName] = useState(patient?.lastName ?? "");
  const [note, setNote] = useState(patient?.note ?? "");
  const [mobility, setMobility] = useState<Posture>(patient?.mobility ?? "assis");
  const [address, setAddress] = useState(home ? `${home.name}, ${home.city}` : "");
  if (!patient) return null;
  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          let location = home;
          if (address.trim() && address.trim() !== (home ? `${home.name}, ${home.city}` : "")) {
            const hit = await geocodeAddress(address.trim());
            if (hit) {
              location = {
                id: `adr-${patient.id}`,
                name: hit.label,
                short: hit.label,
                kind: "domicile",
                lat: hit.lat,
                lng: hit.lng,
                city: "Rouen",
              };
            } else {
              data.dispatch({ type: "TOAST", message: "Adresse introuvable autour de Rouen.", tone: "warn" });
              return;
            }
          }
          data.dispatch({
            type: "UPDATE_PATIENT",
            patient: { ...patient, firstName, lastName, note, mobility, addressId: location?.id ?? patient.addressId },
            location,
          });
          onDone();
        })();
      }}
    >
      <input value={lastName} onChange={(event) => setLastName(event.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm" placeholder="Nom" />
      <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm" placeholder="Prénom" />
      <input value={address} onChange={(event) => setAddress(event.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm sm:col-span-2" placeholder="Adresse" />
      <select value={mobility} onChange={(event) => setMobility(event.target.value as Posture)} className="h-9 rounded-lg border border-line px-2 text-sm">
        <option value="assis">Assis</option>
        <option value="fauteuil">Fauteuil</option>
        <option value="allonge">Allongé</option>
      </select>
      <input value={note} onChange={(event) => setNote(event.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm" placeholder="Notes" />
      <Button type="submit" size="sm" className="sm:col-span-2 w-fit">Enregistrer</Button>
    </form>
  );
}

export function TomorrowView() {
  const data = useData();
  const [openForm, setOpenForm] = useState(false);
  const sites = data.locations.filter((location) => location.kind !== "domicile");
  const homes = data.locations.filter((location) => location.kind === "domicile");
  return (
    <div className="h-full overflow-auto p-4">
      <PageTitle
        title="Demande de demain"
        text="Importez ou saisissez les transports, puis générez le planning. Les séries habituelles peuvent être ajoutées d'un clic."
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            data.dispatch({ type: "NOTE_OPTIMIZER" });
            data.dispatch({ type: "OPEN_MODAL", modal: "optimizer" });
          }}
        >
          Générer le planning
        </Button>
        <Button variant="secondary" onClick={() => setOpenForm((value) => !value)}>Ajouter un transport</Button>
        <Button variant="secondary" onClick={() => data.dispatch({ type: "PLACE_MEALS" })}>Placer les repas</Button>
      </div>
      {openForm && <TransportForm sites={sites} homes={homes} onDone={() => setOpenForm(false)} />}
      <CsvImport />
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {data.transports.length === 0 && <p className="p-4 text-sm text-muted">Aucune course. Ajoutez-en une ou importez un fichier.</p>}
        {data.transports.filter((transport) => !transport.cancelled).map((transport) => {
          const patient = data.patientById.get(transport.patientId);
          const from = data.locMap.get(transport.pickupId);
          const to = data.locMap.get(transport.dropoffId);
          const crew = data.crews.find((item) => item.id === transport.crewId);
          return (
            <div key={transport.id} className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-sm last:border-b-0">
              <span className="w-14 font-mono text-xs">{formatMin(transport.appointmentMin ?? transport.windowStart)}</span>
              <span className="min-w-36 font-semibold">{patient ? personName(patient) : "Patient"}</span>
              <span className="text-muted">{from?.short} → {to?.short}</span>
              <Badge className="bg-paper text-navy">{postureLabel(transport.posture)}</Badge>
              <span className="text-xs text-muted">{kindLabel(transport.kind)}{crew ? ` · ${crew.code}` : " · non affecté"}</span>
              <button type="button" className="ml-auto text-xs font-semibold text-brand" onClick={() => { data.dispatch({ type: "SELECT", id: transport.id }); data.dispatch({ type: "SET_VIEW", view: "gantt" }); }}>
                Timeline
              </button>
              <button type="button" className="text-xs font-semibold text-rose-700" onClick={() => data.dispatch({ type: "REMOVE_TRANSPORT", id: transport.id })}>
                Retirer
              </button>
            </div>
          );
        })}
      </div>
      <div className="mb-2 mt-6 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Séries habituelles</h3>
        <Button variant="secondary" size="sm" onClick={() => data.dispatch({ type: "IMPORT_SERIES" })}>
          Ajouter les séries cochées
        </Button>
        <Button variant="secondary" size="sm" onClick={() => data.dispatch({ type: "ROLL_DAY" })}>
          Reprendre au jour suivant
        </Button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {data.tomorrowItems.length === 0 && <p className="p-4 text-sm text-muted">Aucune série habituelle (dialyse, aller-retour) sur cette journée.</p>}
        {data.tomorrowItems.map((item) => (
          <label key={item.id} className="flex items-start gap-3 border-b border-line px-4 py-2 text-sm last:border-b-0">
            <input type="checkbox" className="mt-1" checked={item.include} onChange={() => data.dispatch({ type: "TOGGLE_TOMORROW", id: item.id })} />
            <span>{item.patientName} · {item.timeLabel} · {item.from} → {item.to}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TransportForm({
  sites,
  homes,
  onDone,
}: {
  sites: { id: string; short: string }[];
  homes: { id: string; short: string }[];
  onDone: () => void;
}) {
  const data = useData();
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [homeId, setHomeId] = useState(homes[0]?.id ?? "");
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [time, setTime] = useState("09:00");
  const [posture, setPosture] = useState<Posture>("assis");
  const [retour, setRetour] = useState(false);
  const [returnTime, setReturnTime] = useState("13:00");
  const [stay, setStay] = useState("0");
  const [note, setNote] = useState("");
  return (
    <form
      className="mb-4 grid gap-2 rounded-2xl border border-line bg-white p-3 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        const [hours, minutes] = time.split(":").map(Number);
        const appointment = (hours || 9) * 60 + (minutes || 0);
        const tolerance = data.rules.toleranceMin;
        const id = `t-new-${Date.now()}`;
        const patientId = `pat-new-${Date.now()}`;
        const transport: Transport = {
          id,
          dossier: `DOS-N${String(Date.now()).slice(-5)}`,
          patientId,
          pickupId: homeId,
          dropoffId: siteId,
          windowStart: Math.max(DAY_START, appointment - tolerance),
          windowEnd: Math.min(DAY_END - 10, appointment + tolerance),
          appointmentMin: appointment,
          toleranceMin: tolerance,
          posture,
          serviceMin: posture === "allonge" ? 16 : 10,
          kind: retour ? "aller" : "simple",
          seriesId: retour ? id : undefined,
          priority: "normal",
          cancelled: false,
          note,
          stayMin: Math.max(0, Number(stay) || 0) || undefined,
        };
        data.dispatch({
          type: "ADD_TRANSPORT",
          transport,
          patient: {
            id: patientId,
            firstName: firstName || "Alex",
            lastName: lastName || "Martin",
            phone: "06 00 00 00 00",
            birthYear: 1958,
            addressId: homeId,
            mobility: posture,
            note,
          },
        });
        if (retour) {
          const [rh, rm] = returnTime.split(":").map(Number);
          const back = (rh || 0) * 60 + (rm || 0);
          data.dispatch({
            type: "ADD_TRANSPORT",
            transport: {
              ...transport,
              id: `${id}-r`,
              pickupId: siteId,
              dropoffId: homeId,
              kind: "retour",
              appointmentMin: back,
              windowStart: back - tolerance,
              windowEnd: back + tolerance,
              seriesId: id,
              stayMin: undefined,
            },
          });
        }
        onDone();
      }}
    >
      <input required value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Nom" className="h-9 rounded-lg border border-line px-2 text-sm" />
      <input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Prénom" className="h-9 rounded-lg border border-line px-2 text-sm" />
      <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm" />
      <select value={homeId} onChange={(event) => setHomeId(event.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm">
        {homes.map((home) => <option key={home.id} value={home.id}>{home.short}</option>)}
      </select>
      <select value={siteId} onChange={(event) => setSiteId(event.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm">
        {sites.map((site) => <option key={site.id} value={site.id}>{site.short}</option>)}
      </select>
      <select value={posture} onChange={(event) => setPosture(event.target.value as Posture)} className="h-9 rounded-lg border border-line px-2 text-sm">
        <option value="assis">Assis</option>
        <option value="fauteuil">Fauteuil</option>
        <option value="allonge">Allongé</option>
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={retour}
          onChange={(event) => {
            const on = event.target.checked;
            setRetour(on);
            if (on) {
              const [hours, minutes] = time.split(":").map(Number);
              const back = (hours || 9) * 60 + (minutes || 0) + data.rules.sessionMin;
              const hh = String(Math.floor(back / 60) % 24).padStart(2, "0");
              const mm = String(back % 60).padStart(2, "0");
              setReturnTime(`${hh}:${mm}`);
            }
          }}
        />{" "}
        Retour
      </label>
      {retour && (
        <input type="time" value={returnTime} onChange={(event) => setReturnTime(event.target.value)} className="h-9 rounded-lg border border-line px-2 text-sm" aria-label="Heure du retour" />
      )}
      <input
        type="number"
        min={0}
        max={480}
        value={stay}
        onChange={(event) => setStay(event.target.value)}
        className="h-9 rounded-lg border border-line px-2 text-sm"
        aria-label="Attente à l'établissement (min)"
        placeholder="Attente min"
        title="Attente à l'établissement, en minutes"
      />
      <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note" className="h-9 rounded-lg border border-line px-2 text-sm sm:col-span-2" />
      <Button type="submit" size="sm">Enregistrer</Button>
    </form>
  );
}

function PageTitle({ title, text }: { title: string; text: string }) {
  return (
    <header className="mb-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{text}</p>
    </header>
  );
}
