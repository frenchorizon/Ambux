import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const primary = "border border-transparent bg-teal text-night-0 shadow-[var(--glow-teal)] hover:brightness-105";
const glass = "glass-surface text-ink shadow-none hover:bg-ice";
const ghost = "border border-transparent bg-transparent text-ink shadow-none hover:bg-ice";
const danger = "border border-transparent bg-coral text-night-0 shadow-none hover:brightness-105";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-label whitespace-nowrap transition-[filter,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary,
        glass,
        ghost,
        danger,
        /* Anciens noms : les écrans ne changent pas de structure. */
        default: primary,
        secondary: glass,
        navy: "border border-transparent bg-navy text-white shadow-none hover:bg-navy-2",
      },
      size: {
        default: "min-h-11 px-4",
        sm: "min-h-11 px-3",
        lg: "min-h-12 px-5 text-body",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
