import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-brand text-white hover:bg-brand-2",
        secondary: "border border-line bg-card text-ink hover:bg-ice",
        ghost: "text-ink hover:bg-ice",
        navy: "bg-navy text-white hover:bg-navy-2",
        danger: "bg-alert-strong text-white hover:opacity-90",
      },
      size: {
        default: "h-10 px-3.5 text-sm",
        sm: "h-8 px-2.5 text-xs",
        lg: "h-12 px-5 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
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
