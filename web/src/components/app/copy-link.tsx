"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

// Mostra um link de convite com botão de copiar (usado enquanto o e-mail não está configurado).
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-ink/15 bg-cream/50 p-2 pl-3">
      <code className="min-w-0 flex-1 truncate text-xs text-ink/75">{url}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-ink shadow-sm hover:bg-cream"
      >
        {copied ? <Check className="size-4 text-brand-green-dark" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
