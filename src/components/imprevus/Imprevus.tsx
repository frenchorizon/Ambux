import { useMemo, useState } from "react";
import { useClock, useData } from "../../game/context";
import { describeChange, diffSummary, planRipple, reoptimizeStable, type StablePlan } from "../../game/imprevus";
import { DAY_END, DAY_START, type Posture, type Transport } from "../../game/types";
import { formatMin, parseClock, personName } from "../../lib/format";
import { Button } from "../ui/button";
import { Modal } from "../ui/dialog";

export function UnavailabilityControls({ crewId }: { crewId: string }) {
  const data = useData();
  const crew = data.crews.find((item) => item.id === crewId);
  const [range, setRange] = useState(false);
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("12:00");
  const [replace, setReplace] = useState(false);
  if (!crew) return null;

  const send = (reason: "absence" | "panne") => {
    const fromMin = range ? parseClock(from) : crew.shiftStart;
    const toMin = range ? parseClock(to) : crew.shiftEnd;
    if (fromMin == null || toMin == null) {
      data.dispatch({ type: "TOAST", message: "Indiquez une heure de début et de fin.", tone: "warn" });
      return;
    }
    data.dispatch({ type: "SET_UNAVAILABILITY", crewId: crew.id, fromMin, toMin, reason, replace });
  };

  return (
    <details className="mt-3 rounded-xl border border-line px-3 py-2">
      <summary className="cursor-pointer text-sm font-semibold">Indisponibilité</summary>
      <div className="mt-2 flex gap-2">
        <button type="button" className={chip(range)} aria-pressed={!range} onClick={() => setRange(false)}>
          Journée
        </button>
        <button type="button" className={chip(!range)} aria-pressed={range} onClick={() => setRange(true)}>
          Créneau
        </button>
      </div>
      {range && (
        <div className="mt-2 flex gap-2">
          <input
            type="time"
            aria-label="Début d'indisponibilité"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className={field}
          />
          <input
            type="time"
            aria-label="Fin d'indisponibilité"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className={field}
          />
        </div>
      )}
      <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />
        Replacer les courses
      </label>
      <div className="mt-1 flex gap-2">
        <Button type="button" variant="secondary" className="h-11 flex-1" onClick={() => send("absence")}>
          Absent
        </Button>
        <Button type="button" variant="secondary" className="h-11 flex-1" onClick={() => send("panne")}>
          Panne
        </Button>
      </div>
    </details>
  );
}

export function ReoptButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="mt-2 h-11 w-full whitespace-normal px-3 text-center leading-tight"
        onClick={() => setOpen(true)}
      >
        Régénérer sans tout bouleverser
      </Button>
      <ReoptDialog key={open ? "ouvert" : "ferme"} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ReoptDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const clock = useClock();
  const [snapshot, setSnapshot] = useState<StablePlan | null>(null);
  const [applied, setApplied] = useState(false);
  const plan = useMemo(() => {
    if (!open) return null;
    return reoptimizeStable({
      crews: data.crews,
      transports: data.transports,
      blocks: data.blocks,
      locations: data.locations,
      nowMin: data.live ? clock.nowMin : -1,
      rules: data.rules,
      labelOf: (transport) => labelOf(data, transport),
    });
  }, [open, data, clock.nowMin]);
  const shown = applied ? snapshot : plan;

  return (
    <Modal
      open={open}
      onClose={() => {
        setApplied(false);
        setSnapshot(null);
        onClose();
      }}
      title="Régénérer sans tout bouleverser"
      description="Les courses épinglées et celles déjà en place restent. Seules les courses à placer ou gênées sont reprises."
    >
      {shown && (
        <>
          <p className="text-sm font-semibold">{diffSummary(shown.changes)}</p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm">
            {shown.changes.length === 0 && <li className="text-muted">Le plan actuel est conservé.</li>}
            {shown.changes.map((change) => (
              <li key={change.transportId} className="rounded-lg bg-paper px-2 py-1.5">
                {describeChange(change, (id) => data.crews.find((crew) => crew.id === id)?.code ?? "Équipage")}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 flex flex-col gap-2">
        {applied ? (
          <Button
            className="h-11"
            variant="secondary"
            onClick={() => {
              data.undo();
              setApplied(false);
              setSnapshot(null);
              onClose();
            }}
          >
            Annuler cette étape
          </Button>
        ) : (
          <Button
            className="h-11"
            disabled={!plan || plan.changes.length === 0}
            onClick={() => {
              if (!plan?.changes.length) return;
              setSnapshot(plan);
              data.dispatch({ type: "APPLY_REOPT" });
              setApplied(true);
            }}
          >
            Appliquer
          </Button>
        )}
        <Button variant="ghost" className="h-11" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </Modal>
  );
}

export function CourseSheet({ transportId, onClose }: { transportId: string; onClose: () => void }) {
  const data = useData();
  const clock = useClock();
  const transport = data.transportById.get(transportId);
  const patient = transport ? data.patientById.get(transport.patientId) : undefined;
  const [crewId, setCrewId] = useState(transport?.crewId ?? data.crews[0]?.id ?? "");
  const [time, setTime] = useState(
    formatMin(transport?.departMin ?? transport?.appointmentMin ?? transport?.windowStart ?? DAY_START),
  );
  if (!transport) return null;
  const crew = data.crews.find((item) => item.id === crewId);
  const requested = parseClock(time);
  const nowMin = data.live ? clock.nowMin : -1;
  const plan =
    crew && requested != null
      ? planRipple({
          crew,
          transport,
          requestedDepart: requested,
          transports: data.transports,
          blocks: data.blocks,
          locMap: data.locMap,
          nowMin,
          rules: data.rules,
          labelOf: (item) => labelOf(data, item),
        })
      : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={patient ? personName(patient) : "Course"}
      description="Épingler, ou poser un créneau et voir les courses suivantes."
    >
      <Button
        className="h-11 w-full"
        variant={transport.pinned ? "navy" : "secondary"}
        onClick={() => data.dispatch({ type: transport.pinned ? "UNPIN" : "PIN", transportId: transport.id })}
      >
        {transport.pinned ? "Retirer l'épingle" : "Épingler"}
      </Button>
      <label className="mt-3 block text-sm font-semibold">
        Équipage
        <select value={crewId} onChange={(event) => setCrewId(event.target.value)} className={`${field} font-normal`}>
          {data.crews.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.driver}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-2 block text-sm font-semibold">
        Départ
        <input
          type="time"
          aria-label="Heure de départ"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          className={`${field} font-normal`}
        />
      </label>
      <div className="mt-3 rounded-xl bg-paper px-3 py-2 text-sm">
        {!plan && <p>Indiquez une heure.</p>}
        {plan && !plan.ok && <p className="text-rose-800">{plan.message}</p>}
        {plan && plan.ok && plan.warning && <p className="text-amber-900">{plan.warning}</p>}
        {plan && plan.ok && plan.shifts.length === 0 && <p className="text-muted">Aucune course suivante décalée.</p>}
        {plan && plan.ok && plan.shifts.length > 0 && (
          <ul className="space-y-1">
            {plan.shifts.map((shift) => (
              <li key={shift.transportId}>
                {shift.label} : {formatMin(shift.fromDepartMin)} → {formatMin(shift.toDepartMin)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button
        className="mt-3 h-11 w-full"
        disabled={!plan?.ok || !crew || requested == null}
        onClick={() => {
          if (!crew || requested == null) return;
          data.dispatch({
            type: "ASSIGN",
            transportId: transport.id,
            crewId: crew.id,
            departMin: requested,
            ripple: true,
          });
        }}
      >
        Poser ce créneau
      </Button>
      <Button variant="ghost" className="mt-2 h-11 w-full" onClick={onClose}>
        Fermer
      </Button>
    </Modal>
  );
}

export function LateCallForm({ onDone }: { onDone: () => void }) {
  const data = useData();
  const homes = data.locations.filter((location) => location.kind === "domicile");
  const sites = data.locations.filter((location) => location.kind !== "domicile" && location.kind !== "depot");
  const fromOptions = homes.length ? homes : data.locations;
  const toOptions = sites.length ? sites : data.locations;
  const [lastName, setLastName] = useState("");
  const [time, setTime] = useState("19:00");
  const [fromId, setFromId] = useState(fromOptions[0]?.id ?? "");
  const [toId, setToId] = useState(toOptions[0]?.id ?? "");
  const [posture, setPosture] = useState<Posture>("assis");

  return (
    <form
      className="mt-2 grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const appointment = parseClock(time);
        if (appointment == null || !fromId || !toId || !lastName.trim()) {
          data.dispatch({ type: "TOAST", message: "Nom, heure et adresses sont requis.", tone: "warn" });
          return;
        }
        const tolerance = data.rules.toleranceMin;
        const stamp = Date.now();
        const patientId = `pat-late-${stamp}`;
        const transport: Transport = {
          id: `t-late-${stamp}`,
          dossier: `DOS-T${String(stamp).slice(-5)}`,
          patientId,
          pickupId: fromId,
          dropoffId: toId,
          windowStart: Math.max(DAY_START, appointment - tolerance),
          windowEnd: Math.min(DAY_END, appointment + tolerance),
          appointmentMin: appointment,
          toleranceMin: tolerance,
          posture,
          serviceMin: posture === "allonge" ? 16 : 10,
          kind: "simple",
          priority: "normal",
          cancelled: false,
          note: "Appel tardif",
        };
        data.dispatch({
          type: "ADD_LATE",
          transport,
          patient: {
            id: patientId,
            firstName: "",
            lastName: lastName.trim(),
            phone: "",
            birthYear: 1960,
            addressId: fromId,
            mobility: posture,
          },
        });
        onDone();
      }}
    >
      <input
        required
        aria-label="Nom du patient"
        value={lastName}
        onChange={(event) => setLastName(event.target.value)}
        placeholder="Nom"
        className={field}
      />
      <input
        type="time"
        aria-label="Heure de prise en charge"
        value={time}
        onChange={(event) => setTime(event.target.value)}
        className={field}
      />
      <select
        aria-label="Prise en charge"
        value={fromId}
        onChange={(event) => setFromId(event.target.value)}
        className={field}
      >
        {fromOptions.map((location) => (
          <option key={location.id} value={location.id}>
            {location.short}
          </option>
        ))}
      </select>
      <select aria-label="Destination" value={toId} onChange={(event) => setToId(event.target.value)} className={field}>
        {toOptions.map((location) => (
          <option key={location.id} value={location.id}>
            {location.short}
          </option>
        ))}
      </select>
      <select
        aria-label="Position"
        value={posture}
        onChange={(event) => setPosture(event.target.value as Posture)}
        className={field}
      >
        <option value="assis">Assis</option>
        <option value="fauteuil">Fauteuil</option>
        <option value="allonge">Allongé</option>
      </select>
      <Button type="submit" className="h-11">
        Ajouter et placer
      </Button>
    </form>
  );
}

function labelOf(
  data: { patientById: { get(id: string): { firstName: string; lastName: string } | undefined } },
  transport: Transport,
): string {
  const patient = data.patientById.get(transport.patientId);
  return patient ? personName(patient) : transport.dossier;
}

const field = "mt-1 h-11 w-full rounded-xl border border-line bg-paper px-3 text-base";

function chip(off: boolean): string {
  return `h-11 flex-1 rounded-xl border text-sm font-semibold ${off ? "border-line bg-paper" : "border-navy bg-navy text-white"}`;
}
