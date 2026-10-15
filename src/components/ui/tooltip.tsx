import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={280}>{children}</TooltipPrimitive.Provider>;
}

export function Hint({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-[70] max-w-xs rounded-lg bg-navy px-2.5 py-1.5 text-xs leading-relaxed text-white shadow-lg",
          )}
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
