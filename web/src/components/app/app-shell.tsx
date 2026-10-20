import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { PageLoading } from "@/components/ui/page-loading";
import { SignOutButton } from "@/components/app/sign-out-button";

export type NavItem = { href: string; label: string; icon: ReactNode; exact?: boolean };

// Estrutura das áreas logadas: menu (lateral no desktop, barra no celular), cabeçalho e conteúdo.
// `nav` e `header` dependem da sessão e chegam por streaming (Suspense).
export function AppShell({
  area,
  nav,
  header,
  children,
}: {
  area: string;
  nav: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-cream/40 lg:grid lg:grid-cols-[256px_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
      {/* Um único menu: barra horizontal no celular, coluna lateral no desktop. */}
      <aside className="order-2 border-b border-ink/10 bg-white lg:order-none lg:row-span-2 lg:flex lg:flex-col lg:border-r lg:border-b-0">
        <Link href="/inicio" className="hidden px-6 pt-6 pb-2 lg:block">
          <Logo size={36} />
        </Link>
        <p className="hidden px-6 pb-4 text-xs font-semibold uppercase tracking-wider text-ink/45 lg:block">{area}</p>
        <nav className="flex gap-1 overflow-x-auto px-2 py-2 lg:flex-1 lg:flex-col lg:px-3 lg:py-0">
          <Suspense fallback={<NavSkeleton />}>{nav}</Suspense>
        </nav>
        <div className="hidden border-t border-ink/10 p-3 lg:block">
          <SignOutButton />
        </div>
      </aside>

      <header className="order-1 flex h-16 items-center justify-between gap-4 border-b border-ink/10 bg-white px-4 lg:order-none lg:px-8">
        <Link href="/inicio" className="lg:hidden">
          <Logo size={30} />
        </Link>
        <div className="flex flex-1 items-center justify-end gap-4">
          <Suspense fallback={<span className="h-9" />}>{header}</Suspense>
        </div>
        <div className="lg:hidden">
          <SignOutButton />
        </div>
      </header>

      <main className="order-3 mx-auto w-full max-w-6xl flex-1 px-4 py-8 lg:order-none lg:px-8">
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </main>
    </div>
  );
}

export function UserBadge({ name, subtitle }: { name: string; subtitle?: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-semibold leading-tight">{name}</p>
        {subtitle && <p className="text-xs text-ink/55">{subtitle}</p>}
      </div>
      <span className="flex size-9 items-center justify-center rounded-full bg-brand-green text-sm font-bold text-white">
        {initials}
      </span>
    </div>
  );
}

function NavSkeleton() {
  return (
    <span className="flex gap-2 px-1 lg:flex-col" aria-hidden>
      <span className="h-9 w-40 animate-pulse rounded-xl bg-cream" />
      <span className="h-9 w-32 animate-pulse rounded-xl bg-cream" />
    </span>
  );
}
