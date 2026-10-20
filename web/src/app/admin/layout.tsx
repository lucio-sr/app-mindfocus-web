import { Building2, LayoutDashboard } from "lucide-react";
import { AppShell, UserBadge } from "@/components/app/app-shell";
import { RequirePlatformAdmin } from "@/components/app/guards";
import { NavLink } from "@/components/app/nav-link";
import { getAccess } from "@/lib/access";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell area="Administração da plataforma" nav={<AdminNav />} header={<AdminHeader />}>
      <RequirePlatformAdmin>{children}</RequirePlatformAdmin>
    </AppShell>
  );
}

async function AdminNav() {
  const access = await getAccess();
  return (
    <>
      <NavLink href="/admin">
        <Building2 className="size-[18px]" aria-hidden /> Instituições
      </NavLink>
      {access && access.memberships.length > 0 && (
        <NavLink href="/painel">
          <LayoutDashboard className="size-[18px]" aria-hidden /> Painel da instituição
        </NavLink>
      )}
    </>
  );
}

async function AdminHeader() {
  const access = await getAccess();
  return access ? <UserBadge name={access.full_name} subtitle="Superadmin" /> : null;
}
