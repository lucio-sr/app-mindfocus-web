-- Remover responsável de um paciente sem perder o histórico de consentimento (LGPD).
--
-- Antes, consents referenciava o vínculo patient_guardians, o que impedia remover um responsável
-- que já tinha consentido. Agora o consentimento referencia o paciente e o profile do responsável:
-- ao remover o vínculo, o consentimento é revogado e continua guardado.

alter table public.consents drop constraint consents_patient_id_guardian_id_fkey;
alter table public.consents
  add constraint consents_guardian_id_fkey
  foreign key (guardian_id) references public.profiles (id) on delete restrict;

create index consents_guardian_id_idx on public.consents (guardian_id);

-- Remove o vínculo responsável–paciente (qualquer colaborador da instituição).
-- Revoga os consentimentos ativos desse responsável para o paciente. O paciente precisa manter
-- ao menos um responsável.
create function public.remove_patient_guardian(p_patient_id uuid, p_guardian_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_institution_id uuid;
begin
  select g.institution_id into v_institution_id
  from public.patient_guardians g
  where g.patient_id = p_patient_id and g.guardian_id = p_guardian_id;

  if v_institution_id is null
     or v_institution_id not in (select private.member_institution_ids()) then
    raise exception 'vínculo não encontrado' using errcode = 'insufficient_privilege';
  end if;

  if (select count(*) from public.patient_guardians g where g.patient_id = p_patient_id) <= 1 then
    raise exception 'o paciente precisa manter ao menos um responsável' using errcode = 'check_violation';
  end if;

  update public.consents
  set revoked_at = now()
  where patient_id = p_patient_id and guardian_id = p_guardian_id and revoked_at is null;

  delete from public.patient_guardians
  where patient_id = p_patient_id and guardian_id = p_guardian_id;
end;
$$;

revoke execute on function public.remove_patient_guardian(uuid, uuid) from public, anon;
grant execute on function public.remove_patient_guardian(uuid, uuid) to authenticated;
