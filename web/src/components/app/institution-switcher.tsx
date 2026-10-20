"use client";

import { Building2 } from "lucide-react";
import { selectInstitution } from "@/app/actions";

type Option = { institution_id: string; institution_name: string };

// Seletor de instituição (só aparece para quem participa de mais de uma).
export function InstitutionSwitcher({ options, current }: { options: Option[]; current: string }) {
  if (options.length < 2) return null;
  return (
    <form action={selectInstitution} className="flex items-center gap-2">
      <Building2 className="size-4 text-ink/50" aria-hidden />
      <label htmlFor="institution-switcher" className="sr-only">
        Instituição
      </label>
      <select
        id="institution-switcher"
        name="institution_id"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-9 max-w-56 truncate rounded-lg border border-ink/15 bg-white px-2 text-sm text-ink focus:border-brand-blue focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.institution_id} value={o.institution_id}>
            {o.institution_name}
          </option>
        ))}
      </select>
    </form>
  );
}
