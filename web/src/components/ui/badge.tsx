import type { ReactNode } from "react";

const tones = {
  green: "bg-brand-green/15 text-brand-green-dark",
  blue: "bg-brand-blue/12 text-brand-blue-dark",
  sand: "bg-sand/30 text-[#8a6420]",
  red: "bg-red-100 text-red-700",
  gray: "bg-ink/8 text-ink/70",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}
