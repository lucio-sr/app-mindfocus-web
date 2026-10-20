import { Loader2 } from "lucide-react";

export function PageLoading() {
  return (
    <p className="flex items-center gap-2 text-ink/60">
      <Loader2 className="size-4 animate-spin" aria-hidden /> Carregando…
    </p>
  );
}
