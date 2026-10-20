import Link from "next/link";
import type { ComponentProps } from "react";

const variants = {
  primary: "bg-brand-blue text-white hover:bg-brand-blue-dark",
  secondary: "bg-brand-green text-white hover:bg-brand-green-dark",
  outline: "border border-ink/15 bg-white text-ink hover:bg-cream",
};

export function LinkButton({ variant = "primary", className = "", ...rest }: ComponentProps<typeof Link> & { variant?: keyof typeof variants }) {
  return (
    <Link
      {...rest}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${variants[variant]} ${className}`}
    />
  );
}
