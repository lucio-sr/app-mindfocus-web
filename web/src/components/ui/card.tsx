import type { ReactNode } from "react";

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-ink/10 bg-white ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-4 border-b border-ink/10 px-6 py-4">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-6">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, icon, tone = "blue" }: { label: string; value: ReactNode; icon: ReactNode; tone?: "blue" | "green" | "sand" }) {
  const tones = { blue: "bg-brand-blue/10 text-brand-blue", green: "bg-brand-green/15 text-brand-green-dark", sand: "bg-sand/25 text-sand-dark" };
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-ink/10 bg-white p-5">
      <span className={`flex size-11 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</span>
      <div>
        <p className="text-sm text-ink/60">{label}</p>
        <p className="font-heading text-2xl font-extrabold">{value}</p>
      </div>
    </div>
  );
}
