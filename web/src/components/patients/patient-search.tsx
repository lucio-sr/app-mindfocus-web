"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Busca por nome ou CPF; atualiza ?q= na URL (o servidor filtra).
export function PatientSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const t = setTimeout(() => {
      if (value.trim() === initial) return;
      const q = value.trim();
      router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname);
    }, 300);
    return () => clearTimeout(t);
  }, [value, initial, pathname, router]);

  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink/40" aria-hidden />
      <label htmlFor="patient-search" className="sr-only">
        Buscar paciente
      </label>
      <input
        id="patient-search"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar por nome ou CPF"
        className="h-11 w-full rounded-xl border border-ink/15 bg-white pr-3 pl-10 text-[15px] placeholder:text-ink/40 focus:border-brand-blue focus:ring-3 focus:ring-brand-blue/15 focus:outline-none"
      />
    </div>
  );
}
