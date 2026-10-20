import { CircleAlert, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";

export function Alert({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const styles =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-brand-green/30 bg-brand-green/10 text-ink";
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-2.5 rounded-xl border p-3.5 text-sm ${styles}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone === "success" ? "text-brand-green-dark" : ""}`} aria-hidden />
      <div>{children}</div>
    </div>
  );
}
