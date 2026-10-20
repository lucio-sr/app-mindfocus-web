import { Building2, House, ShieldCheck, Users, UsersRound } from "lucide-react";
import { AppShell, UserBadge } from "@/components/app/app-shell";
import { RequireMember } from "@/components/app/guards";
import { InstitutionSwitcher } from "@/components/app/institution-switcher";
import { NavLink } from "@/components/app/nav-link";
import { getAccess, getCurrentInstitution } from "@/lib/access";
import { roleLabel } from "@/lib/labels";

export default function PanelLayout({ children }: LayoutProps<"/painel">) {
  return (
    <AppShell area="Painel da instituição" nav={<PanelNav />} header={<PanelHeader />}>
      <RequireMember>{children}</RequireMember>
    </AppShell>
  );
}

const icon = "size-[18px]";

async function PanelNav() {
  const access = await getAccess();
  return (
    <>
      <NavLink href="/painel" exact>
        <House className={icon} aria-hidden /> Início
      </NavLink>
      <NavLink href="/painel/pacientes">
        <UsersRound className={icon} aria-hidden /> Pacientes
      </NavLink>
      <NavLink href="/painel/equipe">
        <Users className={icon} aria-hidden /> Equipe
      </NavLink>
      <NavLink href="/painel/instituicao">
        <Building2 className={icon} aria-hidden /> Instituição
      </NavLink>
      {access?.is_platform_admin && (
        <NavLink href="/admin">
          <ShieldCheck className={icon} aria-hidden /> Administração
        </NavLink>
      )}
    </>
  );
}

async function PanelHeader() {
  const [access, current] = await Promise.all([getAccess(), getCurrentInstitution()]);
  if (!access || !current) return null;
  return (
    <>
      <InstitutionSwitcher options={access.memberships} current={current.institution_id} />
      <UserBadge name={access.full_name} subtitle={`${roleLabel[current.role]} · ${current.institution_name}`} />
    </>
  );
}
