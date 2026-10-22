import { useEffect } from "react";
import { useData } from "../game/context";
import { cn } from "../lib/utils";

export function Toaster() {
  const { toast, dispatch } = useData();
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => dispatch({ type: "DISMISS_TOAST" }), 4600);
    return () => window.clearTimeout(id);
  }, [toast, dispatch]);
  if (!toast) return null;
  return (
    <div className="toast-dock" role="status">
      <div className="glass-opaque flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-body text-ink">
        <span
          aria-hidden
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            toast.tone === "ok" && "bg-gain-bright",
            (toast.tone === "warn" || toast.tone === "bad") && "bg-coral",
            toast.tone === "info" && "bg-teal",
          )}
        />
        <span>{toast.message}</span>
      </div>
    </div>
  );
}
