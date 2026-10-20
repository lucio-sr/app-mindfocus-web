"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Abre o anexo com uma URL assinada de curta duração (o bucket é privado).
export function AttachmentLink({ path, fileName }: { path: string; fileName: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function open() {
    setLoading(true);
    setError(false);
    const { data } = await createClient()
      .storage.from("assessments")
      .createSignedUrl(path, 60, { download: fileName ?? true });
    setLoading(false);
    if (data?.signedUrl) window.location.assign(data.signedUrl);
    else setError(true);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={open}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue hover:underline disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
        {fileName ?? "Anexo"}
      </button>
      {error && <span className="text-sm text-red-700">Não foi possível abrir o anexo.</span>}
    </span>
  );
}
