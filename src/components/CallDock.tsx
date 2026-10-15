import { PhoneCall } from "lucide-react";
import { useData } from "../game/context";
import type { Call } from "../game/types";
import { Button } from "./ui/button";

export function CallDock() {
  const { calls, phase } = useData();
  if (phase !== "playing") return null;
  const pending = calls.filter((call) => call.spawned && !call.resolved);
  if (!pending.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[min(100%-1.5rem,380px)] flex-col gap-2">
      {pending.slice(0, 2).map((call) => (
        <CallCard key={call.id} call={call} />
      ))}
      {pending.length > 2 && (
        <div className="rounded-xl bg-navy px-3 py-2 text-center text-xs font-semibold text-white">
          {pending.length - 2} autre{pending.length - 2 > 1 ? "s" : ""} appel{pending.length - 2 > 1 ? "s" : ""} en attente
        </div>
      )}
    </div>
  );
}

function CallCard({ call }: { call: Call }) {
  const { dispatch } = useData();
  const forced = call.kind === "retard" || call.kind === "panne";
  return (
    <article className="rounded-2xl border border-rose-100 bg-white p-3 shadow-2xl ring-2 ring-rose-100">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <PhoneCall size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">Appel entrant</div>
          <div className="text-sm font-semibold text-ink">{call.title}</div>
          <div className="text-xs text-muted">{call.caller} · {call.phone}</div>
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink">{call.body}</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => dispatch({ type: "RESOLVE_CALL", callId: call.id, choice: "accept" })}>
          {forced ? "Prendre en compte" : call.kind === "pause" ? "Accorder" : "Accepter"}
        </Button>
        {!forced && (
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => dispatch({ type: "RESOLVE_CALL", callId: call.id, choice: "refuse" })}>
            Refuser
          </Button>
        )}
      </div>
    </article>
  );
}
