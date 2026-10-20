"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

const inputClass =
  "h-11 w-full rounded-xl border bg-white px-3.5 text-[15px] text-ink placeholder:text-ink/40 transition-colors focus:outline-none focus:ring-3 disabled:bg-cream/60";

export function Field({ label, error, hint, id, className = "", ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`${inputClass} ${
          error
            ? "border-red-400 focus:border-red-500 focus:ring-red-100"
            : "border-ink/15 focus:border-brand-blue focus:ring-brand-blue/15"
        }`}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-ink/60">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordField(props: Omit<Props, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Field {...props} type={visible ? "text" : "password"} className={props.className} style={{ paddingRight: 44 }} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1.5 top-[30px] flex size-9 items-center justify-center rounded-lg text-ink/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-blue"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
      >
        {visible ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </button>
    </div>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; options: { value: string; label: string }[] };

export function SelectField({ label, error, options, id, className = "", ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={selectId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={Boolean(error)}
        className={`${inputClass} ${error ? "border-red-400" : "border-ink/15 focus:border-brand-blue focus:ring-brand-blue/15"}`}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
