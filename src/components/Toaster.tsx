import { useEffect } from "react";
import { useData } from "../game/context";
import { cn } from "../lib/utils";

export function Toaster() {
  const { toast, dispatch } = useData();
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => dispatch({ type: "DISMISS_TOAST" }), 3000);
    return () => window.clearTimeout(id);
  }, [toast, dispatch]);
  if (!toast) return null;
  return (
    <div className="toast-dock" role="status">
      <div className="glass type-body flex items-center gap-2.5 rounded-full px-4 py-2 text-white">
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
