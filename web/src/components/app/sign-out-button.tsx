"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await createClient().auth.signOut();
        router.replace("/entrar?saiu=1");
        router.refresh();
      }}
      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-ink/70 hover:bg-cream hover:text-ink disabled:opacity-60"
    >
      <LogOut className="size-4" aria-hidden />
      Sair
    </button>
  );
}
