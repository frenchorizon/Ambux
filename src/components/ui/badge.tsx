import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "glass-surface inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-label text-ink",
        className,
      )}
      {...props}
    />
  );
}
