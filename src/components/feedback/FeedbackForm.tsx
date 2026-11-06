import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  APP_VERSION,
  countersOf,
  feedbackChannel,
  feedbackMailto,
  postFeedback,
  screenFromApp,
  tallyHref,
  technicalContext,
  type FeedbackDraft,
} from "../../feedback/channel";
import { useData } from "../../game/context";
import { loadWorkspace, subscribeWorkspace } from "../../game/workspace";
import { Button } from "../ui/button";
import { Modal } from "../ui/dialog";
import { cn } from "../../lib/utils";

export function FeedbackButton({ ecran, className }: { ecran?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? "feedback-link"} onClick={() => setOpen(true)}>
        Donner mon avis
      </button>
      {open ? <FeedbackDialog ecran={ecran} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function FeedbackDialog({ ecran, onClose }: { ecran?: string; onClose: () => void }) {
  const data = useData();
  const profile = useSyncExternalStore(subscribeWorkspace, loadWorkspace, () => null);
  const channel = useMemo(() => feedbackChannel(), []);
  const contexte = useMemo(
    () =>
      technicalContext({
        version: APP_VERSION,
        ecran: ecran ?? screenFromApp(data.phase, data.view),
        mode: profile?.mode === "entreprise" ? "entreprise" : "demo",
        ...countersOf(data),
      }),
    [data, ecran, profile?.mode],
  );
  const [note, setNote] = useState<number | null>(null);
  const [texte, setTexte] = useState("");
  const [capture, setCapture] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const draft: FeedbackDraft | null =
    note == null
      ? null
      : {
          note,
          texte,
          capture,
          contexte,
        };
  const mailto = channel.kind === "mailto" && draft ? feedbackMailto(channel.email, draft) : "";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || busy) return;
    setError("");
    if (channel.kind === "mailto") {
      window.location.href = mailto;
      setDone(
        channel.placeholder
          ? "Le courriel est prêt. L'adresse est encore le placeholder à compléter par Nicolas."
          : "Le courriel est prêt dans le logiciel de messagerie.",
      );
      return;
    }
    if (channel.kind === "tally") {
      const href = tallyHref(channel.url, draft);
      if (!href) {
        setError("L'adresse Tally n'est pas utilisable.");
        return;
      }
      window.open(href, "_blank", "noopener,noreferrer");
      setDone("Le formulaire Tally s'ouvre. La capture reste sur cet appareil.");
      return;
    }
    setBusy(true);
    try {
      await postFeedback(channel.url, draft);
      setDone("Avis envoyé. Les données métier n'ont pas été jointes.");
    } catch {
      setError("L'envoi n'a pas abouti.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="Donner mon avis" description="Les données métier ne sont pas jointes." onClose={onClose}>
      <form className="grid gap-3" onSubmit={(event) => void submit(event)} data-feedback-channel={channel.kind}>
        <p className="text-sm leading-relaxed text-muted">N'écrivez pas de nom, d'adresse ou de dossier.</p>
        <fieldset>
          <legend className="text-sm font-semibold">Note</legend>
          <div className="mt-2 flex gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <label
                key={value}
                className={cn(
                  "relative inline-flex size-11 cursor-pointer items-center justify-center rounded-full border text-sm font-semibold",
                  note === value ? "border-transparent bg-teal text-night-0" : "border-line bg-card",
                )}
              >
                <input
                  className="absolute inset-0 z-10 cursor-pointer opacity-0"
                  type="radio"
                  name="note"
                  value={value}
                  checked={note === value}
                  required
                  onChange={() => setNote(value)}
                />
                <span className="pointer-events-none">{value}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-semibold">
          Texte
          <textarea
            name="texte"
            rows={3}
            maxLength={4000}
            value={texte}
            aria-label="Texte"
            placeholder="Ce qui aide, ce qui bloque"
            className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-base font-normal"
            onChange={(event) => setTexte(event.target.value)}
          />
        </label>
        <label className="block text-sm font-semibold">
          Capture d'écran facultative
          <input
            type="file"
            accept="image/*"
            aria-label="Capture d'écran"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (file && !file.type.startsWith("image/")) {
                setCapture(null);
                setError("Choisissez un fichier image.");
                return;
              }
              setError("");
              setCapture(file);
            }}
          />
          <span className="mt-1 inline-flex min-h-11 items-center rounded-full border border-line bg-card px-3 text-sm font-normal">
            {capture ? "Image choisie" : "Choisir une image"}
          </span>
        </label>
        {channel.kind !== "form" ? (
          <p className="text-xs leading-relaxed text-muted">
            Sans URL Formspree, la capture reste ici.
            {channel.kind === "mailto" && channel.placeholder
              ? ` Repli : ${channel.email}, à remplacer par Nicolas.`
              : ""}
          </p>
        ) : null}
        <div>
          <p className="text-sm font-semibold">Contexte technique joint</p>
          <dl
            className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm"
            data-feedback-context={JSON.stringify(contexte)}
          >
            <div>
              <dt className="text-xs text-muted">Version</dt>
              <dd>{contexte.version}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Écran</dt>
              <dd>{contexte.ecran}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Mode</dt>
              <dd>{contexte.mode}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Courses</dt>
              <dd>{contexte.courses}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Équipages</dt>
              <dd>{contexte.equipages}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Véhicules</dt>
              <dd>{contexte.vehicules}</dd>
            </div>
          </dl>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-alert">
            {error}
          </p>
        ) : null}
        {done ? (
          <p role="status" className="text-sm font-semibold">
            {done}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button type="submit" disabled={note == null || busy} data-feedback-mailto={mailto || undefined}>
            {busy ? "Envoi…" : channel.kind === "mailto" ? "Ouvrir le courriel" : "Envoyer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
