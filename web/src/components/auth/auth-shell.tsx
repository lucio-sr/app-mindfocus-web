import Image from "next/image";
import { Brain, ChartLine, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";

const highlights = [
  { icon: Brain, text: "Rastreio com jogos e testes neuropsicológicos" },
  { icon: ChartLine, text: "Acompanhamento longitudinal de cada paciente" },
  { icon: ShieldCheck, text: "Dados isolados por instituição, conforme a LGPD" },
];

// Layout das telas de acesso: painel da marca (azul) à esquerda, formulário à direita.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-brand-blue text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="absolute -right-24 -top-24 size-80 rounded-full bg-brand-green/90" />
        <div aria-hidden className="absolute -bottom-32 -left-20 size-96 rounded-full bg-white/10" />

        <div className="relative flex items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white shadow-sm">
            <Image src="/brand/mascote.png" alt="" width={44} height={44} style={{ width: 44, height: "auto" }} priority />
          </span>
          <span className="font-heading text-2xl font-extrabold">MindFocus</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight">Ciência e cuidado no acompanhamento do neurodesenvolvimento.</h2>
          <ul className="mt-8 space-y-4">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/70">RF Healthtech</p>
      </aside>

      <main className="flex flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <Logo size={44} className="mb-10 lg:hidden" />
          <h1 className="text-3xl font-extrabold text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-ink/70">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
