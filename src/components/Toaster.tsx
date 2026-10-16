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
    <div className="pointer-events-none fixed left-1/2 top-16 z-[75] w-[min(100%-1.5rem,440px)] -translate-x-1/2">
      <div
        className={cn(
          "rounded-xl px-3 py-2 text-sm font-medium shadow-lg",
          toast.tone === "ok" && "bg-emerald-700 text-white",
          toast.tone === "warn" && "bg-amber-600 text-white",
          toast.tone === "bad" && "bg-rose-700 text-white",
          toast.tone === "info" && "bg-navy text-white",
        )}
      >
        {toast.message}
      </div>
    </div>
  );
}
